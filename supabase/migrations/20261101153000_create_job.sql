-- P4-1 강습 등록: 강습·손님 강습료·손님(기존 또는 새로)을 한 트랜잭션으로 만든다.
-- security invoker라 RLS(샵 멤버만)가 그대로 적용된다. 새 강습은 draft로 시작하고,
-- 직접 의뢰(P4-2)나 입찰 공고(P4-3)로 내보낼 때 상태가 바뀐다.
alter table jobs add constraint jobs_patch_paid_by_check
  check (patch_paid_by is null or patch_paid_by in ('shop', 'instructor', 'customer'));

create function public.create_job(
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
  p_customer_id uuid,      -- 기존 손님
  p_new_customer jsonb     -- 또는 새 손님 {name, phone, level}
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
    insert into public.customers (shop_id, name, phone, level)
    values (p_shop_id, btrim(p_new_customer ->> 'name'),
            nullif(btrim(p_new_customer ->> 'phone'), ''), nullif(btrim(p_new_customer ->> 'level'), ''))
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

revoke execute on function public.create_job(uuid, int, int, timestamptz, timestamptz, lesson_type, int, int, int, text, text, uuid, jsonb) from public, anon;
grant execute on function public.create_job(uuid, int, int, timestamptz, timestamptz, lesson_type, int, int, int, text, text, uuid, jsonb) to authenticated;
