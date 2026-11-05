-- P19-2 정산 무결성 후속 (P18 보고서 P2 5·7·8·9번)
-- A 승인된 강습의 시간·상태와 승인된 배정의 금액·강사를 샵이 표로 직접 바꿔 정산 달을 옮기거나 금액을 바꿀 수 있었다.
--   → 승인 이후 그 열의 변경·삭제를 트리거로 막고, 고칠 일이 있으면 정정 RPC(correct_approved_lesson, 사유·이력)로만.
--   앱 화면은 강습·배정을 표로 직접 쓰지 않는다(모두 RPC). 서비스 키·본사·app.system_write는 그대로 통과.
-- B 강사 지급액 0·음수·아주 큰 값: RPC는 안내 메시지(1원~1,000만 원), 표는 CHECK 제약.
-- C 입찰과 선정이 겹칠 때: 잠금 순서를 "공고 → 입찰"로 통일(place_bid는 공고를 잠그지 않았고 select_bid는 입찰부터 잠갔다).
--   선정 때 강사가 그 사이 전속이 됐는지 다시 본다.
-- D 승인 뒤 샵 유형·사업자번호는 샵이 직접 못 바꾸고 본사 승인(request_shop_change → decide_shop_change).
--
-- 되돌리기: 트리거 guard_approved_job·guard_approved_assignment·guard_shop_identity와 그 함수, 함수 correct_approved_lesson·
--   request_shop_change·decide_shop_change·private.check_won, 표 lesson_corrections·shop_change_requests, CHECK 제약 4개를 지우고
--   create_job·place_bid·select_bid를 이전 정의(20261102000100_customer_consents·20261102131000_sport_rules·20261101160000_select_bid)로 다시 만든다.

-- 금액 검증 (RPC용 안내 메시지) ------------------------------------------------
create function private.check_won(p int, what text, min_won int default 1) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p is null or p < min_won or p > 10000000 then
    raise exception '% %원 이상 1,000만 원 이하로 입력해 주세요', what, min_won using errcode = '22023';
  end if;
end $$;

alter table public.jobs add constraint jobs_instructor_rate_range check (instructor_rate is null or instructor_rate between 1 and 10000000);
alter table public.assignments add constraint assignments_final_rate_range check (final_rate is null or final_rate between 1 and 10000000);
alter table public.bids add constraint bids_amount_range check (amount between 1 and 10000000);
alter table public.job_prices add constraint job_prices_customer_price_range check (customer_price is null or customer_price between 0 and 10000000);

-- A. 승인 이후 직접 수정 차단 ----------------------------------------------------
create function private.may_bypass_guard() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is null or private.is_platform_admin() or coalesce(current_setting('app.system_write', true), '') = 'on'
$$;

create function private.guard_approved_job() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status <> 'approved' or private.may_bypass_guard() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception '승인된 강습은 지울 수 없습니다' using errcode = '42501';
  end if;
  if (new.starts_at, new.ends_at, new.status, new.shop_id) is distinct from (old.starts_at, old.ends_at, old.status, old.shop_id) then
    raise exception '승인된 강습의 시간·상태는 정정 절차로만 바꿀 수 있습니다' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_approved_job before update or delete on public.jobs
  for each row execute function private.guard_approved_job();

create function private.guard_approved_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.may_bypass_guard() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'INSERT' then
    if exists (select 1 from public.jobs where id = new.job_id and status = 'approved') then
      raise exception '승인된 강습에는 배정을 더할 수 없습니다' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.approved_at is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception '승인된 배정은 지울 수 없습니다' using errcode = '42501';
  end if;
  if (new.job_id, new.instructor_id, new.via_shop_id, new.final_rate, new.approved_at)
     is distinct from (old.job_id, old.instructor_id, old.via_shop_id, old.final_rate, old.approved_at) then
    raise exception '승인된 배정의 금액·강사는 정정 절차로만 바꿀 수 있습니다' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_approved_assignment before insert or update or delete on public.assignments
  for each row execute function private.guard_approved_assignment();

-- 정정 이력
create table public.lesson_corrections (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  old_values jsonb not null,
  new_values jsonb not null,
  reason text not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index on public.lesson_corrections (shop_id, changed_at desc);
alter table public.lesson_corrections enable row level security;
create policy shop_read on public.lesson_corrections for select to authenticated using (private.is_shop_member(shop_id));
create policy platform_admin_read on public.lesson_corrections for select to authenticated using (private.is_platform_admin());

-- 승인된 강습 정정: 시작·종료 시각과 강사 지급액. 발행된 정산서에 들어간 강습은 고치지 않는다(다음 달에 조정).
create function public.correct_approved_lesson(p_job_id uuid, p_starts timestamptz, p_ends timestamptz, p_final_rate int, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  j public.jobs;
  a public.assignments;
begin
  select * into j from public.jobs where id = p_job_id for update;
  if j.id is null or not private.is_shop_member(j.shop_id) then
    raise exception '이 샵의 강습이 아닙니다' using errcode = '42501';
  end if;
  if j.status <> 'approved' then
    raise exception '승인된 강습만 정정합니다. 승인 전에는 강습 화면에서 고쳐 주세요' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception '정정 사유를 적어 주세요' using errcode = '22023';
  end if;
  if p_starts is null or p_ends is null or p_ends <= p_starts then
    raise exception '끝나는 시각은 시작보다 늦어야 합니다' using errcode = '22023';
  end if;
  perform private.check_won(p_final_rate, '강사 지급액은');
  select * into a from public.assignments where job_id = j.id for update;
  if exists (select 1 from public.settlement_items si join public.settlements s on s.id = si.settlement_id
             where si.assignment_id = a.id and s.status <> 'draft') then
    raise exception '발행된 정산서에 들어간 강습은 고칠 수 없습니다' using errcode = '22023';
  end if;
  if a.instructor_id is not null and private.has_time_conflict(a.instructor_id, p_starts, p_ends, j.id) then
    raise exception '이 강사는 그 시간에 다른 강습이 있습니다' using errcode = '22023';
  end if;

  insert into public.lesson_corrections (job_id, shop_id, old_values, new_values, reason, changed_by)
  values (j.id, j.shop_id,
          jsonb_build_object('starts_at', j.starts_at, 'ends_at', j.ends_at, 'final_rate', a.final_rate),
          jsonb_build_object('starts_at', p_starts, 'ends_at', p_ends, 'final_rate', p_final_rate),
          btrim(p_reason), auth.uid());
  -- 이 강습이 든 집계(draft)는 지운다: 다시 집계하면 새 값으로 들어간다
  delete from public.settlements s using public.settlement_items si
  where si.settlement_id = s.id and si.assignment_id = a.id and s.status = 'draft';
  perform set_config('app.system_write', 'on', true);
  update public.jobs set starts_at = p_starts, ends_at = p_ends where id = j.id;
  update public.assignments set final_rate = p_final_rate where id = a.id;
  perform set_config('app.system_write', 'off', true);
end $$;
revoke execute on function public.correct_approved_lesson(uuid, timestamptz, timestamptz, int, text) from public, anon;
grant execute on function public.correct_approved_lesson(uuid, timestamptz, timestamptz, int, text) to authenticated;

-- B. 강습 등록 금액 검증 (나머지는 20261102000100_customer_consents.sql 정의와 같다) ------
create or replace function public.create_job(p_shop_id uuid, p_resort_id integer, p_sport_id integer, p_starts timestamp with time zone, p_ends timestamp with time zone, p_lesson_type lesson_type, p_student_count integer, p_customer_price integer, p_instructor_rate integer, p_patch_paid_by text, p_note text, p_customer_id uuid, p_new_customer jsonb)
 returns uuid
 language plpgsql
 set search_path to ''
as $function$
declare
  job_id uuid;
  cust uuid := p_customer_id;
begin
  if not private.is_shop_member(p_shop_id) then
    raise exception '이 샵의 멤버만 강습을 등록할 수 있습니다' using errcode = '42501';
  end if;
  if not exists (select 1 from public.shop_resorts where shop_id = p_shop_id and resort_id = p_resort_id) then
    raise exception '영업 스키장에서만 강습을 등록할 수 있습니다' using errcode = '22023';
  end if;
  if p_patch_paid_by is not null and p_patch_paid_by not in ('shop', 'instructor', 'customer') then
    raise exception '패치 구매 주체를 확인해 주세요' using errcode = '22023';
  end if;
  if p_instructor_rate is not null then
    perform private.check_won(p_instructor_rate, '강사 지급액은');
  end if;
  if p_customer_price is not null then
    perform private.check_won(p_customer_price, '손님 강습료는', 0);
  end if;
  if cust is not null and not exists (select 1 from public.customers where id = cust and shop_id = p_shop_id) then
    raise exception '이 샵의 손님이 아닙니다' using errcode = '22023';
  end if;

  if cust is null and nullif(btrim(p_new_customer ->> 'name'), '') is not null then
    insert into public.customers (shop_id, name, phone, level, owner_user_id)
    values (p_shop_id, btrim(p_new_customer ->> 'name'),
            nullif(btrim(p_new_customer ->> 'phone'), ''), nullif(btrim(p_new_customer ->> 'level'), ''), auth.uid())
    returning id into cust;
  end if;

  insert into public.jobs (shop_id, resort_id, sport_id, starts_at, ends_at, lesson_type, student_count,
                           instructor_rate, patch_paid_by, note, status)
  values (p_shop_id, p_resort_id, p_sport_id, p_starts, p_ends, p_lesson_type, p_student_count,
          p_instructor_rate, p_patch_paid_by, nullif(btrim(p_note), ''), 'draft')
  returning id into job_id;

  if p_customer_price is not null then
    insert into public.job_prices (job_id, customer_price) values (job_id, p_customer_price);
  end if;
  if cust is not null then
    insert into public.job_customers (job_id, customer_id) values (job_id, cust);
  end if;
  return job_id;
end $function$;

-- C. 입찰: 공고를 먼저 잠근다 (선정과 겹치면 선정이 끝난 뒤 다시 읽어 "입찰 중 아님"으로 거부) -------
create or replace function public.place_bid(p_job_id uuid, p_amount integer, p_memo text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  me uuid := private.my_instructor_id();
  j public.jobs;
  bid_id uuid;
begin
  if me is null or private.is_exclusive() then
    raise exception '프리랜서 강사만 입찰할 수 있습니다' using errcode = '42501';
  end if;
  select * into j from public.jobs where id = p_job_id for share;
  if j.id is null or j.status <> 'open' or j.assign_mode <> 'bid' then
    raise exception '입찰 중인 공고가 아닙니다' using errcode = '22023';
  end if;
  if j.bid_closes_at is not null and j.bid_closes_at <= now() then
    raise exception '마감된 공고입니다' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > j.instructor_rate then
    raise exception '금액은 상한가 이하로 제시해 주세요' using errcode = '22023';
  end if;
  if j.sport_id is not null and not exists (select 1 from public.instructor_sports where instructor_id = me and sport_id = j.sport_id) then
    raise exception '이 종목을 하지 않는 강사입니다' using errcode = '22023';
  end if;
  if private.has_time_conflict(me, j.starts_at, j.ends_at, j.id) then
    raise exception '같은 시간에 확정된 강습이 있습니다' using errcode = '22023';
  end if;

  update public.bids set amount = p_amount, memo = nullif(btrim(p_memo), ''), created_at = now()
  where job_id = j.id and instructor_id = me and status = 'open'
  returning id into bid_id;
  if bid_id is null then
    insert into public.bids (job_id, bidder_type, instructor_id, amount, memo)
    values (j.id, 'instructor', me, p_amount, nullif(btrim(p_memo), ''))
    returning id into bid_id;
    insert into public.notifications (user_id, kind, payload)
    select m.user_id, 'bid_placed', jsonb_build_object('job_id', j.id, 'bid_id', bid_id)
    from public.shop_members m where m.shop_id = j.shop_id;
  end if;
  return bid_id;
end $function$;

-- 선정: 공고 → 입찰 순서로 잠그고, 전속 여부·금액을 다시 본다
create or replace function public.select_bid(p_bid_id uuid, p_final_rate integer)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  b public.bids;
  j public.jobs;
  assignment_id uuid;
begin
  select * into j from public.jobs where id = (select job_id from public.bids where id = p_bid_id) for update;
  if j.id is null or not private.is_shop_member(j.shop_id) then
    raise exception '이 샵의 공고가 아닙니다' using errcode = '42501';
  end if;
  select * into b from public.bids where id = p_bid_id for update;
  if j.status <> 'open' or j.assign_mode <> 'bid' or b.status <> 'open' then
    raise exception '선정할 수 없는 공고나 입찰입니다' using errcode = '22023';
  end if;
  perform private.check_won(p_final_rate, '강사 지급액은');
  if b.instructor_id is not null and exists (select 1 from public.shop_instructors where instructor_id = b.instructor_id) then
    raise exception '전속 강사가 된 강사의 입찰은 선정할 수 없습니다' using errcode = '22023';
  end if;
  if b.instructor_id is not null and private.has_time_conflict(b.instructor_id, j.starts_at, j.ends_at, j.id) then
    raise exception '이 강사는 같은 시간에 다른 강습이 확정됐습니다' using errcode = '22023';
  end if;

  -- 팀 입찰이면 강사는 팀이 나중에 정한다 (via_shop_id)
  insert into public.assignments (job_id, instructor_id, via_shop_id, final_rate)
  values (j.id, b.instructor_id, case when b.bidder_type = 'shop' then b.bidder_shop_id end, p_final_rate)
  returning id into assignment_id;
  update public.jobs set status = 'assigned' where id = j.id;
  update public.bids set status = 'selected' where id = b.id;
  update public.bids set status = 'rejected' where job_id = j.id and id <> b.id and status = 'open';

  insert into public.notifications (user_id, kind, payload)
  select i.user_id, 'bid_selected', jsonb_build_object('job_id', j.id, 'amount', p_final_rate)
  from public.instructors i where i.id = b.instructor_id
  union all
  select m.user_id, 'bid_selected', jsonb_build_object('job_id', j.id, 'amount', p_final_rate)
  from public.shop_members m where b.bidder_type = 'shop' and m.shop_id = b.bidder_shop_id
  union all
  select i.user_id, 'bid_rejected', jsonb_build_object('job_id', j.id)
  from public.bids o join public.instructors i on i.id = o.instructor_id
  where o.job_id = j.id and o.id <> b.id and o.status = 'rejected';
  return assignment_id;
end $function$;

-- D. 승인 뒤 샵 유형·사업자번호는 본사 승인으로 ------------------------------------
create function private.guard_shop_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- 사업자번호를 처음 적는 것(빈 값 → 값)은 온보딩 단계라 허용한다
  if old.status = 'approved' and not private.may_bypass_guard()
     and (new.type is distinct from old.type
          or (old.business_no is not null and new.business_no is distinct from old.business_no)) then
    raise exception '승인된 샵의 유형·사업자번호는 본사 승인을 거쳐 바꿉니다' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_shop_identity before update on public.shops
  for each row execute function private.guard_shop_identity();

create table public.shop_change_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  new_type public.shop_type,
  new_business_no text,
  old_type public.shop_type not null,
  old_business_no text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'canceled')),
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz
);
create unique index shop_change_requests_one_pending on public.shop_change_requests (shop_id) where status = 'pending';
alter table public.shop_change_requests enable row level security;
create policy shop_read on public.shop_change_requests for select to authenticated using (private.is_shop_member(shop_id));
create policy platform_admin_read on public.shop_change_requests for select to authenticated using (private.is_platform_admin());

-- 대표 관리자가 요청 (대기 중인 요청은 새 요청으로 바뀐다)
create function public.request_shop_change(p_shop_id uuid, p_type public.shop_type, p_business_no text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.shops; rid uuid; bn text := nullif(btrim(p_business_no), '');
begin
  if not private.is_shop_owner(p_shop_id) then
    raise exception '대표 관리자만 요청할 수 있습니다' using errcode = '42501';
  end if;
  select * into s from public.shops where id = p_shop_id;
  if (coalesce(p_type, s.type), coalesce(bn, s.business_no)) is not distinct from (s.type, s.business_no) then
    raise exception '바뀐 내용이 없습니다' using errcode = '22023';
  end if;
  update public.shop_change_requests set status = 'canceled' where shop_id = p_shop_id and status = 'pending';
  insert into public.shop_change_requests (shop_id, new_type, new_business_no, old_type, old_business_no, requested_by)
  values (p_shop_id, p_type, bn, s.type, s.business_no, auth.uid())
  returning id into rid;
  insert into public.notifications (user_id, kind, payload)
  select p.id, 'shop_change_requested', jsonb_build_object('shop_id', p_shop_id, 'request_id', rid)
  from public.profiles p where p.role = 'platform_admin';
  return rid;
end $$;
revoke execute on function public.request_shop_change(uuid, public.shop_type, text) from public, anon;
grant execute on function public.request_shop_change(uuid, public.shop_type, text) to authenticated;

-- 본사 결정
create function public.decide_shop_change(p_request_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.shop_change_requests;
begin
  if not private.is_platform_admin() then
    raise exception '본사 관리자만 결정할 수 있습니다' using errcode = '42501';
  end if;
  select * into r from public.shop_change_requests where id = p_request_id and status = 'pending' for update;
  if r.id is null then
    raise exception '대기 중인 요청이 아닙니다' using errcode = '22023';
  end if;
  update public.shop_change_requests
  set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now()
  where id = r.id;
  if p_approve then
    update public.shops set type = coalesce(r.new_type, type), business_no = coalesce(r.new_business_no, business_no) where id = r.shop_id;
  end if;
  insert into public.notifications (user_id, kind, payload)
  select m.user_id, 'shop_change_decided', jsonb_build_object('approved', p_approve)
  from public.shop_members m where m.shop_id = r.shop_id;
end $$;
revoke execute on function public.decide_shop_change(uuid, boolean) from public, anon;
grant execute on function public.decide_shop_change(uuid, boolean) to authenticated;
