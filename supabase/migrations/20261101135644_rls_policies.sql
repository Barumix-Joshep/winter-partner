-- P1-2 RLS 정책 (설계: docs/plans/P1-2-rls.md)
-- 정책은 authenticated(일부 anon)에만 준다. service_role은 RLS를 우회한다.

-- 스키마 보정 -------------------------------------------------------------
-- 손님 강습료는 강사에게 보이면 안 된다. RLS는 행 단위라 별도 테이블로 뺀다.
alter table jobs drop column customer_price;
create table job_prices (
  job_id uuid primary key references jobs(id) on delete cascade,
  customer_price int
);

-- 샵을 만든 사람 (owner 자동 등록, 생성 직후 조회용)
alter table shops add column created_by uuid references profiles(id) default auth.uid();

-- 판단 함수 (PostgREST 비노출 스키마) ---------------------------------------
create schema if not exists private;
grant usage on schema private to anon, authenticated;

create function private.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'platform_admin')
$$;

create function private.is_shop_member(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shop_members where shop_id = s and user_id = auth.uid())
$$;

create function private.is_shop_owner(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shop_members where shop_id = s and user_id = auth.uid() and is_owner)
$$;

create function private.is_any_shop_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shop_members where user_id = auth.uid())
$$;

create function private.shares_shop(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shop_members a join public.shop_members b on a.shop_id = b.shop_id
    where a.user_id = auth.uid() and b.user_id = uid)
$$;

create function private.is_lesson_team_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shop_members m join public.shops s on s.id = m.shop_id
    where m.user_id = auth.uid() and s.type = 'lesson_team' and s.status = 'approved')
$$;

create function private.is_lesson_team(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shops where id = s and type = 'lesson_team' and status = 'approved')
$$;

create function private.my_instructor_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.instructors where user_id = auth.uid()
$$;

create function private.is_instructor_user(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.instructors where user_id = uid)
$$;

-- 전속 강사인가 (전속이면 입찰 공고를 볼 수 없다)
create function private.is_exclusive() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shop_instructors si join public.instructors i on i.id = si.instructor_id
    where i.user_id = auth.uid())
$$;

create function private.job_shop_id(j uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select shop_id from public.jobs where id = j
$$;

create function private.job_open_for_bids(j uuid, team boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.jobs
    where id = j and status = 'open' and assign_mode = 'bid' and (not team or allow_team_bids))
$$;

create function private.is_assigned(j uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assignments a join public.instructors i on i.id = a.instructor_id
    where a.job_id = j and i.user_id = auth.uid())
$$;

-- 의뢰·입찰·배정으로 이 강습에 엮였는가 (강사 본인 또는 팀 멤버)
create function private.has_job_link(j uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_assigned(j)
    or exists (select 1 from public.job_offers o join public.instructors i on i.id = o.instructor_id
               where o.job_id = j and i.user_id = auth.uid())
    or exists (select 1 from public.bids b
               where b.job_id = j and (
                 b.instructor_id = private.my_instructor_id()
                 or private.is_shop_member(b.bidder_shop_id)))
    or exists (select 1 from public.assignments a where a.job_id = j and private.is_shop_member(a.via_shop_id))
$$;

create function private.customer_shop_id(c uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select shop_id from public.customers where id = c
$$;

create function private.settlement_shop_id(s uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select shop_id from public.settlements where id = s
$$;

create function private.can_see_settlement(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.settlements
    where id = s and (
      private.is_shop_member(shop_id)
      or instructor_id = private.my_instructor_id()
      or private.is_shop_member(payee_shop_id)
      or private.is_platform_admin()))
$$;

-- 열 보호 트리거 ------------------------------------------------------------
-- 플랫폼 관리자도 authenticated로 접속하므로 열 GRANT 대신 트리거로 막는다.
-- auth.uid()가 없으면(service_role·마이그레이션) 통과시킨다.
-- 트리거 인자: 관리자만 바꿀 수 있는 열 이름들
create function private.guard_admin_columns() returns trigger
language plpgsql security definer set search_path = '' as $$
declare col text;
begin
  if auth.uid() is null or private.is_platform_admin() then
    return new;
  end if;
  foreach col in array tg_argv loop
    if to_jsonb(new) -> col is distinct from to_jsonb(old) -> col then
      raise exception '플랫폼 관리자만 바꿀 수 있는 값입니다: %', col using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

create trigger guard_admin_columns before update on profiles
  for each row execute function private.guard_admin_columns('role');
create trigger guard_admin_columns before update on shops
  for each row execute function private.guard_admin_columns('status', 'created_by');
create trigger guard_admin_columns before update on instructors
  for each row execute function private.guard_admin_columns('cert_status', 'penalty_points', 'user_id');
create trigger guard_admin_columns before update on instructor_certs
  for each row execute function private.guard_admin_columns('status', 'verified_at');

-- 강사는 배정에서 완료 시각과 강습 노트만 쓴다
create function private.guard_assignment_columns() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or private.is_platform_admin() or private.is_shop_member(private.job_shop_id(old.job_id)) then
    return new;
  end if;
  if (new.job_id, new.instructor_id, new.via_shop_id, new.final_rate, new.approved_at, new.approved_by)
     is distinct from (old.job_id, old.instructor_id, old.via_shop_id, old.final_rate, old.approved_at, old.approved_by) then
    raise exception '강사는 완료 시각과 강습 노트만 바꿀 수 있습니다' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger guard_assignment_columns before update on assignments for each row execute function private.guard_assignment_columns();

-- 샵을 만든 사람을 owner로 등록
create function private.add_shop_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    insert into public.shop_members (shop_id, user_id, is_owner) values (new.id, auth.uid(), true)
    on conflict do nothing;
  end if;
  return new;
end $$;

create trigger add_shop_owner after insert on shops for each row execute function private.add_shop_owner();

-- RLS 켜기 ----------------------------------------------------------------
alter table resorts enable row level security;
alter table sports enable row level security;
alter table profiles enable row level security;
alter table shops enable row level security;
alter table shop_members enable row level security;
alter table shop_resorts enable row level security;
alter table instructors enable row level security;
alter table instructor_certs enable row level security;
alter table instructor_sports enable row level security;
alter table instructor_resorts enable row level security;
alter table availability enable row level security;
alter table shop_instructors enable row level security;
alter table customers enable row level security;
alter table customer_links enable row level security;
alter table inquiries enable row level security;
alter table jobs enable row level security;
alter table job_prices enable row level security;
alter table job_customers enable row level security;
alter table job_offers enable row level security;
alter table bids enable row level security;
alter table assignments enable row level security;
alter table settlements enable row level security;
alter table settlement_items enable row level security;
alter table ratings enable row level security;
alter table instructor_penalties enable row level security;
alter table notifications enable row level security;

-- 플랫폼 관리자: 손님 정보(customers·customer_links·inquiries·job_customers·job_prices)를 뺀 전체
do $$
declare t text;
begin
  foreach t in array array[
    'resorts', 'sports', 'profiles', 'shops', 'shop_members', 'shop_resorts',
    'instructors', 'instructor_certs', 'instructor_sports', 'instructor_resorts', 'availability',
    'shop_instructors', 'jobs', 'job_offers', 'bids', 'assignments',
    'settlements', 'settlement_items', 'ratings', 'instructor_penalties', 'notifications']
  loop
    execute format(
      'create policy platform_admin_all on %I for all to authenticated using (private.is_platform_admin()) with check (private.is_platform_admin())', t);
  end loop;
end $$;

-- 기준 정보 ---------------------------------------------------------------
create policy read_all on resorts for select to anon, authenticated using (true);
create policy read_all on sports for select to anon, authenticated using (true);

-- profiles ----------------------------------------------------------------
create policy self_read on profiles for select to authenticated
  using (id = auth.uid() or private.shares_shop(id) or (private.is_any_shop_member() and private.is_instructor_user(id)));
create policy self_insert on profiles for insert to authenticated
  with check (id = auth.uid() and role in ('shop_admin', 'instructor'));
create policy self_update on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- shops -------------------------------------------------------------------
create policy read on shops for select to authenticated
  using (status = 'approved' or created_by = auth.uid() or private.is_shop_member(id));
create policy create_own on shops for insert to authenticated
  with check (
    created_by = auth.uid() and status = 'pending'
    and exists (select 1 from profiles where id = auth.uid() and role = 'shop_admin'));
create policy owner_update on shops for update to authenticated
  using (private.is_shop_owner(id)) with check (private.is_shop_owner(id));

create policy member_read on shop_members for select to authenticated
  using (user_id = auth.uid() or private.is_shop_member(shop_id));
create policy owner_write on shop_members for all to authenticated
  using (private.is_shop_owner(shop_id)) with check (private.is_shop_owner(shop_id));

create policy read_all on shop_resorts for select to authenticated using (true);
create policy member_write on shop_resorts for all to authenticated
  using (private.is_shop_member(shop_id)) with check (private.is_shop_member(shop_id));

-- 강사 (공용 프로필) --------------------------------------------------------
create policy read_all on instructors for select to authenticated using (true);
create policy self_insert on instructors for insert to authenticated
  with check (
    user_id = auth.uid() and cert_status = 'pending' and penalty_points = 0
    and exists (select 1 from profiles where id = auth.uid() and role = 'instructor'));
create policy self_update on instructors for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 자격증은 본사 검증 뒤에만 남에게 보인다
create policy read on instructor_certs for select to authenticated
  using (status = 'approved' or instructor_id = private.my_instructor_id());
create policy self_insert on instructor_certs for insert to authenticated
  with check (instructor_id = private.my_instructor_id() and status = 'pending' and verified_at is null);
create policy self_update on instructor_certs for update to authenticated
  using (instructor_id = private.my_instructor_id()) with check (instructor_id = private.my_instructor_id());
create policy self_delete on instructor_certs for delete to authenticated
  using (instructor_id = private.my_instructor_id());

create policy read_all on instructor_sports for select to authenticated using (true);
create policy self_write on instructor_sports for all to authenticated
  using (instructor_id = private.my_instructor_id()) with check (instructor_id = private.my_instructor_id());

create policy read_all on instructor_resorts for select to authenticated using (true);
create policy self_write on instructor_resorts for all to authenticated
  using (instructor_id = private.my_instructor_id()) with check (instructor_id = private.my_instructor_id());

create policy read on availability for select to authenticated
  using (instructor_id = private.my_instructor_id() or private.is_any_shop_member());
create policy self_write on availability for all to authenticated
  using (instructor_id = private.my_instructor_id()) with check (instructor_id = private.my_instructor_id());

create policy read on shop_instructors for select to authenticated
  using (private.is_shop_member(shop_id) or instructor_id = private.my_instructor_id());
create policy member_write on shop_instructors for all to authenticated
  using (private.is_shop_member(shop_id)) with check (private.is_shop_member(shop_id));
create policy self_leave on shop_instructors for delete to authenticated
  using (instructor_id = private.my_instructor_id());

-- 손님 정보: 샵 멤버만 (플랫폼 관리자·강사 제외) -----------------------------
create policy member_all on customers for all to authenticated
  using (private.is_shop_member(shop_id)) with check (private.is_shop_member(shop_id));
create policy member_all on customer_links for all to authenticated
  using (private.is_shop_member(private.customer_shop_id(customer_id))
         and private.is_shop_member(private.customer_shop_id(linked_customer_id)))
  with check (private.is_shop_member(private.customer_shop_id(customer_id))
              and private.is_shop_member(private.customer_shop_id(linked_customer_id)));
create policy member_all on inquiries for all to authenticated
  using (private.is_shop_member(shop_id)) with check (private.is_shop_member(shop_id));
create policy member_all on job_customers for all to authenticated
  using (private.is_shop_member(private.job_shop_id(job_id)))
  with check (private.is_shop_member(private.job_shop_id(job_id))
              and private.customer_shop_id(customer_id) = private.job_shop_id(job_id));
create policy member_all on job_prices for all to authenticated
  using (private.is_shop_member(private.job_shop_id(job_id)))
  with check (private.is_shop_member(private.job_shop_id(job_id)));

-- 강습 --------------------------------------------------------------------
create policy member_all on jobs for all to authenticated
  using (private.is_shop_member(shop_id)) with check (private.is_shop_member(shop_id));
create policy linked_read on jobs for select to authenticated
  using (private.has_job_link(id));
-- 공개 입찰 공고: 전속이 아닌 강사, 또는 팀 입찰 허용 공고의 강습팀
create policy open_bids_read on jobs for select to authenticated
  using (status = 'open' and assign_mode = 'bid' and (
    (private.my_instructor_id() is not null and not private.is_exclusive())
    or (allow_team_bids and private.is_lesson_team_member())));

create policy shop_all on job_offers for all to authenticated
  using (private.is_shop_member(private.job_shop_id(job_id)))
  with check (private.is_shop_member(private.job_shop_id(job_id)));
create policy self_read on job_offers for select to authenticated
  using (instructor_id = private.my_instructor_id());
create policy self_respond on job_offers for update to authenticated
  using (instructor_id = private.my_instructor_id())
  with check (instructor_id = private.my_instructor_id() and status in ('accepted', 'declined'));

-- 입찰: 공고 샵은 전부 보고 선정한다. 입찰자는 자기 입찰만.
create policy shop_all on bids for all to authenticated
  using (private.is_shop_member(private.job_shop_id(job_id)))
  with check (private.is_shop_member(private.job_shop_id(job_id)));
create policy bidder_read on bids for select to authenticated
  using (instructor_id = private.my_instructor_id() or private.is_shop_member(bidder_shop_id));
create policy bidder_insert on bids for insert to authenticated
  with check (status = 'open' and (
    (bidder_type = 'instructor' and instructor_id = private.my_instructor_id()
     and not private.is_exclusive() and private.job_open_for_bids(job_id, false))
    or (bidder_type = 'shop' and private.is_shop_member(bidder_shop_id) and private.is_lesson_team(bidder_shop_id)
        and bidder_shop_id <> private.job_shop_id(job_id) and private.job_open_for_bids(job_id, true))));
create policy bidder_update on bids for update to authenticated
  using (instructor_id = private.my_instructor_id() or private.is_shop_member(bidder_shop_id))
  with check (status in ('open', 'withdrawn')
              and (instructor_id = private.my_instructor_id() or private.is_shop_member(bidder_shop_id)));

-- 배정: 공고 샵이 만들고 고친다. 강사는 노트·완료만 (트리거).
create policy shop_all on assignments for all to authenticated
  using (private.is_shop_member(private.job_shop_id(job_id)))
  with check (private.is_shop_member(private.job_shop_id(job_id)));
create policy assignee_read on assignments for select to authenticated
  using (instructor_id = private.my_instructor_id() or private.is_shop_member(via_shop_id));
create policy assignee_update on assignments for update to authenticated
  using (instructor_id = private.my_instructor_id())
  with check (instructor_id = private.my_instructor_id());

-- 정산 --------------------------------------------------------------------
create policy shop_all on settlements for all to authenticated
  using (private.is_shop_member(shop_id)) with check (private.is_shop_member(shop_id));
create policy payee_read on settlements for select to authenticated
  using (instructor_id = private.my_instructor_id() or private.is_shop_member(payee_shop_id));

create policy read on settlement_items for select to authenticated
  using (private.can_see_settlement(settlement_id));
create policy shop_write on settlement_items for all to authenticated
  using (private.is_shop_member(private.settlement_shop_id(settlement_id)))
  with check (private.is_shop_member(private.settlement_shop_id(settlement_id)));

-- 평가 --------------------------------------------------------------------
create policy read on ratings for select to authenticated
  using (private.is_shop_member(private.job_shop_id(job_id))
         or to_instructor_id = private.my_instructor_id()
         or private.is_shop_member(to_shop_id));
create policy participant_insert on ratings for insert to authenticated
  with check (
    (from_role = 'shop_admin' and private.is_shop_member(private.job_shop_id(job_id)) and to_shop_id is null)
    or (from_role = 'instructor' and private.is_assigned(job_id)
        and to_instructor_id is null and to_shop_id = private.job_shop_id(job_id)));

-- 패널티: 강사 본인은 조회만. 기록은 관리자·서버.
create policy self_read on instructor_penalties for select to authenticated
  using (instructor_id = private.my_instructor_id());

-- 알림: 본인 것만. 생성은 서버(service_role).
create policy self_read on notifications for select to authenticated using (user_id = auth.uid());
create policy self_update on notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
