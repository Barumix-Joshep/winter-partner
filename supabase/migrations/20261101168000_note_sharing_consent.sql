-- P7-2 강사 노트 공유 범위와 개인정보 동의
-- 손님: privacy_consent_at = "개인정보 수집·이용 및 담당 강사 제공 동의"를 받은 시각 (샵이 기록).
--   동의한 손님만 지난 수업 메모가 그 샵의 다음 담당 강사에게 공유된다. 메모는 샵 밖으로 나가지 않는다.
-- 회원: 가입할 때 이용약관·개인정보 처리방침 동의 시각을 남긴다.
alter table customers add column privacy_consent_at timestamptz;
alter table profiles add column terms_agreed_at timestamptz;
alter table profiles add column privacy_agreed_at timestamptz;

-- 가입 트리거: 메타데이터 agreed=true면 동의 시각을 남긴다
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r text := new.raw_user_meta_data ->> 'role';
  n text := nullif(btrim(new.raw_user_meta_data ->> 'name'), '');
  agreed boolean := coalesce((new.raw_user_meta_data ->> 'agreed')::boolean, false);
begin
  if r is null or r not in ('shop_admin', 'instructor') then
    return new;
  end if;
  insert into public.profiles (id, role, name, terms_agreed_at, privacy_agreed_at)
  values (new.id, r::public.user_role, coalesce(n, split_part(new.email, '@', 1)),
          case when agreed then now() end, case when agreed then now() end);
  if r = 'instructor' then
    insert into public.instructors (user_id) values (new.id);
  end if;
  return new;
end $$;

-- 본인 동의 기록 (카카오 첫 로그인·기존 회원)
create function public.record_terms_agreement() returns void
language sql security definer set search_path = '' as $$
  update public.profiles set terms_agreed_at = now(), privacy_agreed_at = now() where id = auth.uid()
$$;

-- 이 강습 손님들의 지난 수업 메모 (같은 샵, 동의한 손님, 최근 5개)
create function public.previous_lesson_notes(p_job_id uuid)
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
  join public.customers c on c.id = me.customer_id and c.shop_id = s and c.privacy_consent_at is not null
  join public.job_customers other on other.customer_id = c.id and other.job_id <> p_job_id
  join public.jobs j on j.id = other.job_id and j.shop_id = s and j.status in ('done', 'approved')
  join public.assignments a on a.job_id = j.id and a.lesson_note is not null
  left join public.sports sp on sp.id = j.sport_id
  where me.job_id = p_job_id
  order by j.starts_at desc, a.id
  limit 5;
end $$;

revoke execute on function public.record_terms_agreement() from public, anon;
revoke execute on function public.previous_lesson_notes(uuid) from public, anon;
grant execute on function public.record_terms_agreement() to authenticated;
grant execute on function public.previous_lesson_notes(uuid) to authenticated;

-- 강습 등록에서 새 손님을 만들 때 개인정보 동의도 함께 받는다 (p_new_customer.privacy_consent)
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
    insert into public.customers (shop_id, name, phone, level, privacy_consent_at)
    values (p_shop_id, btrim(p_new_customer ->> 'name'),
            nullif(btrim(p_new_customer ->> 'phone'), ''), nullif(btrim(p_new_customer ->> 'level'), ''),
            case when coalesce((p_new_customer ->> 'privacy_consent')::boolean, false) then now() end)
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
