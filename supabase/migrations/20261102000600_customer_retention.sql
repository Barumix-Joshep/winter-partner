-- P13-6 손님 정보 보관·파기
-- 익명화: 이름·연락처·보호자·출생 연도·장비·태그·메모·다음 연락, 연락 기록·동의 링크·일행 연결, 그 손님 강습의 요청 사항·수업 메모를 지운다.
-- 통계용 강습 이력(강습 일시·종목·금액·레벨)과 동의 기록(개인 식별 정보 없음)은 남긴다. 되돌릴 수 없다.
-- 보관 기간: 마지막 강습(없으면 등록일) 시즌 뒤로 app_settings.customer_retention_seasons(기본 3)시즌이 지나고 다음 시즌이 시작되면 익명화.
-- 시즌: 11월~다음 해 4월. 5~10월은 직전 시즌으로 센다.
alter table customers add column anonymized_at timestamptz;

create table customer_erasures (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  reason text not null check (reason in ('request', 'retention')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table customer_erasures enable row level security;
create policy platform_admin_read on customer_erasures for select to authenticated using (private.is_platform_admin());
create policy member_read on customer_erasures for select to authenticated using (private.is_shop_member(shop_id));

create function private.season_of(p_at timestamptz) returns int
language sql stable set search_path = '' as $$
  select case when extract(month from p_at at time zone 'Asia/Seoul') >= 11
              then extract(year from p_at at time zone 'Asia/Seoul')::int
              else extract(year from p_at at time zone 'Asia/Seoul')::int - 1 end
$$;

create function private.anonymize_customer(p_customer_id uuid, p_reason text, p_by uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s uuid;
begin
  select shop_id into s from public.customers where id = p_customer_id and anonymized_at is null for update;
  if s is null then
    return;
  end if;
  update public.customers set
    name = '익명 손님', phone = null, guardian_name = null, guardian_phone = null, birth_year = null,
    equipment_size = null, tags = '{}', memo = null, next_contact_on = null, next_contact_note = null,
    owner_user_id = null, merge_candidate_id = null, anonymized_at = now()
  where id = p_customer_id;
  update public.customers set merge_candidate_id = null where merge_candidate_id = p_customer_id;
  delete from public.customer_contacts where customer_id = p_customer_id;
  delete from public.consent_links where customer_id = p_customer_id;
  delete from public.customer_links where customer_id = p_customer_id or linked_customer_id = p_customer_id;
  -- 그 손님이 들은 강습의 요청 사항·수업 메모 (손님 묘사가 들어 있을 수 있다)
  update public.jobs set note = null where id in (select job_id from public.job_customers where customer_id = p_customer_id);
  perform set_config('app.system_write', 'on', true);
  update public.assignments set lesson_note = null where job_id in (select job_id from public.job_customers where customer_id = p_customer_id);
  perform set_config('app.system_write', 'off', true);
  insert into public.customer_erasures (shop_id, customer_id, reason, created_by) values (s, p_customer_id, p_reason, p_by);
end $$;

-- 샵이 손님의 삭제 요청을 처리한다. 확인 문구('익명화')를 받아야 실행한다.
create function public.erase_customer(p_customer_id uuid, p_confirm text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s uuid;
begin
  select shop_id into s from public.customers where id = p_customer_id;
  if s is null or not private.is_shop_member(s) then
    raise exception '우리 샵 손님이 아닙니다' using errcode = '42501';
  end if;
  if coalesce(btrim(p_confirm), '') <> '익명화' then
    raise exception '확인 문구를 입력해 주세요' using errcode = '22023';
  end if;
  perform private.anonymize_customer(p_customer_id, 'request', auth.uid());
end $$;

-- 매일 크론(service_role): 보관 기간이 지난 손님 익명화
create function public.purge_expired_customers()
returns int language plpgsql security definer set search_path = '' as $$
declare
  keep int := private.setting_int('customer_retention_seasons');
  now_season int := private.season_of(now());
  r record;
  n int := 0;
begin
  for r in
    select c.id
    from public.customers c
    left join lateral (
      select max(j.starts_at) as last_at from public.job_customers jc join public.jobs j on j.id = jc.job_id where jc.customer_id = c.id
    ) l on true
    where c.anonymized_at is null
      and private.season_of(coalesce(l.last_at, c.created_at)) + keep < now_season
  loop
    perform private.anonymize_customer(r.id, 'retention', null);
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function public.erase_customer(uuid, text) from public, anon;
grant execute on function public.erase_customer(uuid, text) to authenticated;
revoke execute on function public.purge_expired_customers() from public, anon, authenticated;
grant execute on function public.purge_expired_customers() to service_role;
revoke all on function private.anonymize_customer(uuid, text, uuid) from public, anon, authenticated, service_role;

-- 익명화된 손님은 광고 발송 대상에서 뺀다
create or replace function public.marketing_recipients(p_shop_id uuid)
returns table (customer_id uuid, name text, phone text, consented_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select s.customer_id, c.name, c.phone, s.created_at
  from public.customer_consent_state s join public.customers c on c.id = s.customer_id
  where s.shop_id = p_shop_id and s.kind = 'marketing' and s.valid and c.anonymized_at is null
$$;
