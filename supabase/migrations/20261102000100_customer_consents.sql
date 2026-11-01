-- P13-1 손님 정보 수집 근거 재구성
-- 강습 진행에 필요한 정보(이름, 연락처/보호자 연락처, 강습 일시, 레벨, 장비 사이즈)는 계약 이행 근거로 동의 없이 받고 안내만 한다.
-- 동의는 선택 항목(마케팅 수신, 사진·영상)에만 받는다. 손님 본인(또는 보호자)이 직접 한 동의만 유효하고,
-- 직원이 대신 체크한 기록은 'staff'(직원 기록)로 남겨 구분한다. 기록은 추가만 하고 고치거나 지우지 않는다.
-- 기존 customers.marketing_consent·privacy_consent_at은 지우지 않고 직원 기록으로 옮긴 뒤 더 쓰지 않는다.

-- 바꿀 수 있는 설정값 (플랫폼 관리자가 DB에서 수정). private 스키마라 API로는 보이지 않는다.
create table private.app_settings (
  key text primary key,
  value jsonb not null,
  note text
);
insert into private.app_settings (key, value, note) values
  ('consent_recheck_years', '2', '광고 수신 등 선택 동의 재확인 주기(년)'),
  ('customer_retention_seasons', '3', '마지막 강습 후 손님 정보 보관 시즌 수 (시즌: 11월~다음 해 4월)'),
  ('access_log_retention_years', '2', '접속 기록 보관 기간(년)');

create function private.setting_int(k text) returns int
language sql stable security definer set search_path = '' as $$
  select (value #>> '{}')::int from private.app_settings where key = k
$$;

create table customer_consents (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,                                 -- 같은 시각 기록의 순서
  shop_id uuid not null references shops(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  kind text not null check (kind in ('marketing', 'photo', 'privacy_legacy')),
  granted boolean not null,
  subject text not null check (subject in ('self', 'guardian', 'staff')),  -- 본인 / 보호자 / 직원 기록
  method text not null check (method in ('qr', 'link', 'onsite')),
  text_version text not null,
  recorded_by uuid references profiles(id) on delete set null,          -- 직원 기록일 때 기록한 사람
  created_at timestamptz not null default now()
);
create index on customer_consents (customer_id, kind, created_at desc, seq desc);

-- 기록은 고칠 수 없다 (손님 익명화도 동의 기록은 그대로 둔다: 개인 식별 정보가 없다)
create function private.consents_immutable() returns trigger
language plpgsql as $$
begin
  raise exception '동의 기록은 고칠 수 없습니다' using errcode = '42501';
end $$;
create trigger consents_immutable before update on customer_consents
  for each row execute function private.consents_immutable();

alter table customer_consents enable row level security;
create policy platform_admin_read on customer_consents for select to authenticated using (private.is_platform_admin());
create policy member_read on customer_consents for select to authenticated using (private.is_shop_member(shop_id));
-- insert·delete 정책 없음: 직원 기록은 record_staff_consent, 본인·보호자 동의는 공개 페이지 함수(service_role)로만

-- 종류별 최신 상태. valid = 본인·보호자의 동의이고 재확인 주기 안 (14세 미만 조건은 P13-2에서 더한다)
create view customer_consent_state with (security_invoker = true) as
select distinct on (c.customer_id, c.kind)
  c.shop_id, c.customer_id, c.kind, c.granted, c.subject, c.method, c.text_version, c.created_at,
  (c.granted and c.subject in ('self', 'guardian')
     and c.created_at > now() - make_interval(years => private.setting_int('consent_recheck_years'))) as valid,
  (c.granted and c.subject in ('self', 'guardian')
     and c.created_at <= now() - make_interval(years => private.setting_int('consent_recheck_years'))) as needs_recheck
from public.customer_consents c
order by c.customer_id, c.kind, c.created_at desc, c.seq desc;

-- 직원 기록: 현장에서 들은 동의·철회를 남긴다. 동의는 무효로 표시되고, 철회는 그대로 효력이 있다.
create function public.record_staff_consent(p_customer_id uuid, p_kind text, p_granted boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  s uuid;
  cid uuid;
begin
  select shop_id into s from public.customers where id = p_customer_id;
  if s is null or not private.is_shop_member(s) then
    raise exception '우리 샵 손님이 아닙니다' using errcode = '42501';
  end if;
  if p_kind not in ('marketing', 'photo') or p_granted is null then
    raise exception '동의 항목을 확인해 주세요' using errcode = '22023';
  end if;
  insert into public.customer_consents (shop_id, customer_id, kind, granted, subject, method, text_version, recorded_by)
  values (s, p_customer_id, p_kind, p_granted, 'staff', 'onsite', 'staff-record', auth.uid())
  returning id into cid;
  return cid;
end $$;

-- 광고 발송 대상: 유효한 마케팅 동의만 (직원 기록·재확인 필요·철회 제외)
create function public.marketing_recipients(p_shop_id uuid)
returns table (customer_id uuid, name text, phone text, consented_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select s.customer_id, c.name, c.phone, s.created_at
  from public.customer_consent_state s join public.customers c on c.id = s.customer_id
  where s.shop_id = p_shop_id and s.kind = 'marketing' and s.valid
$$;

revoke execute on function public.record_staff_consent(uuid, text, boolean) from public, anon;
revoke execute on function public.marketing_recipients(uuid) from public, anon;
grant execute on function public.record_staff_consent(uuid, text, boolean) to authenticated;
grant execute on function public.marketing_recipients(uuid) to authenticated;
grant select on public.customer_consent_state to authenticated;

-- 기존 기록 이관 (지우지 않는다): 직원이 체크한 것이므로 staff, 방법 onsite, 문구 버전 legacy
insert into public.customer_consents (shop_id, customer_id, kind, granted, subject, method, text_version, created_at)
select shop_id, id, 'marketing', true, 'staff', 'onsite', 'legacy', coalesce(consent_at, created_at)
from public.customers where marketing_consent;
insert into public.customer_consents (shop_id, customer_id, kind, granted, subject, method, text_version, created_at)
select shop_id, id, 'privacy_legacy', true, 'staff', 'onsite', 'legacy', privacy_consent_at
from public.customers where privacy_consent_at is not null;
comment on column public.customers.marketing_consent is 'P13-1부터 쓰지 않음. customer_consents를 본다';
comment on column public.customers.privacy_consent_at is 'P13-1부터 쓰지 않음 (직원 기록으로 이관됨)';

-- 지난 수업 메모: 계약 이행(다음 담당 강사가 이어서 가르침) 근거로 같은 샵 강습 안에서만 공유. 동의 조건은 없앤다.
create or replace function public.previous_lesson_notes(p_job_id uuid)
returns table (lesson_date date, sport text, note text)
language plpgsql stable security definer set search_path = '' as $$
declare
  s uuid := private.job_shop_id(p_job_id);
begin
  if s is null or not (private.is_shop_member(s) or private.is_assigned(p_job_id)
                      or exists (select 1 from public.job_offers o where o.job_id = p_job_id and o.instructor_id = private.my_instructor_id())) then
    raise exception '이 강습을 맡은 강사나 샵만 볼 수 있습니다' using errcode = '42501';
  end if;
  return query
  select distinct on (j.starts_at, a.id) (j.starts_at at time zone 'Asia/Seoul')::date, sp.name, a.lesson_note
  from public.job_customers me
  join public.customers c on c.id = me.customer_id and c.shop_id = s
  join public.job_customers other on other.customer_id = c.id and other.job_id <> p_job_id
  join public.jobs j on j.id = other.job_id and j.shop_id = s and j.status in ('done', 'approved')
  join public.assignments a on a.job_id = j.id and a.lesson_note is not null
  left join public.sports sp on sp.id = j.sport_id
  where me.job_id = p_job_id
  order by j.starts_at desc, a.id
  limit 5;
end $$;

-- 강습 등록에서 만드는 새 손님: 동의 체크 없이 (안내만)
create or replace function public.create_job(
  p_shop_id uuid,
  p_resort_id int,
  p_sport_id int,
  p_starts timestamptz,
  p_ends timestamptz,
  p_lesson_type lesson_type,
  p_student_count int,
  p_customer_price int,
  p_instructor_rate int,
  p_patch_paid_by text,
  p_note text,
  p_customer_id uuid,
  p_new_customer jsonb
) returns uuid
language plpgsql security invoker set search_path = '' as $$
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
end $$;
