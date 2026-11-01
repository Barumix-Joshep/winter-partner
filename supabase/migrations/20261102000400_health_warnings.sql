-- P13-4 건강 정보 방지: 받지 않는 것이 원칙. 메모에 건강 관련 단어가 들어가면 저장은 허용하고 경고를 기록한다.
-- 기록에는 메모 원문을 남기지 않고, 걸린 단어만 남긴다 (건강 정보를 또 복사하지 않게).
create table health_warnings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  field text not null check (field in ('customer_memo', 'lesson_note', 'contact_memo')),
  customer_id uuid references customers(id) on delete cascade,
  job_id uuid references jobs(id) on delete cascade,
  terms text[] not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on health_warnings (shop_id, created_at desc);
alter table health_warnings enable row level security;
create policy platform_admin_read on health_warnings for select to authenticated using (private.is_platform_admin());
create policy member_read on health_warnings for select to authenticated using (private.is_shop_member(shop_id));

-- 샵 멤버(손님 메모·연락 기록) 또는 그 강습을 맡은 강사(수업 메모)만 남긴다
create function public.record_health_warning(p_field text, p_customer_id uuid, p_job_id uuid, p_terms text[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  s uuid;
begin
  if p_terms is null or cardinality(p_terms) = 0 or cardinality(p_terms) > 20 then
    return;
  end if;
  if p_field = 'lesson_note' then
    s := private.job_shop_id(p_job_id);
    if s is null or not (private.is_assigned(p_job_id) or private.is_shop_member(s)) then
      raise exception '이 강습을 맡은 강사나 샵만 기록할 수 있습니다' using errcode = '42501';
    end if;
  elsif p_field in ('customer_memo', 'contact_memo') then
    select shop_id into s from public.customers where id = p_customer_id;
    if s is null or not private.is_shop_member(s) then
      raise exception '우리 샵 손님이 아닙니다' using errcode = '42501';
    end if;
  else
    raise exception '항목을 확인해 주세요' using errcode = '22023';
  end if;
  insert into public.health_warnings (shop_id, field, customer_id, job_id, terms, created_by)
  values (s, p_field, p_customer_id, p_job_id, (select array_agg(left(t, 20)) from unnest(p_terms) t), auth.uid());
end $$;

revoke execute on function public.record_health_warning(text, uuid, uuid, text[]) from public, anon;
grant execute on function public.record_health_warning(text, uuid, uuid, text[]) to authenticated;
