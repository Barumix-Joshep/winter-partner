-- P16-4 시범 샵 온보딩
-- 1) 홈 상단 체크리스트: 샵 정보 → 영업 스키장 → 강사 등록 → 첫 강습 → 알림 켜기. 완료는 데이터로 자동 판단하고, 닫기만 저장한다.
-- 2) 강사 CSV 일괄 등록: 샵이 가진 이메일·휴대폰 목록과 정확히 맞는 강사만 돌려준다(목록 밖의 강사는 드러나지 않는다).

alter table shops add column onboarding_hidden boolean not null default false;

create function public.shop_onboarding(p_shop_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.shops;
begin
  if not private.is_shop_member(p_shop_id) then
    raise exception '우리 샵만 볼 수 있습니다' using errcode = '42501';
  end if;
  select * into s from public.shops where id = p_shop_id;
  return jsonb_build_object(
    'info', nullif(btrim(coalesce(s.business_no, '')), '') is not null and nullif(btrim(coalesce(s.owner_name, '')), '') is not null,
    'resorts', exists (select 1 from public.shop_resorts where shop_id = p_shop_id),
    -- 전속 강사가 있거나, 전속 초대·직접 의뢰를 한 번이라도 보냈으면
    'instructors', exists (select 1 from public.shop_instructors where shop_id = p_shop_id)
                   or exists (select 1 from public.exclusive_invites where shop_id = p_shop_id)
                   or exists (select 1 from public.job_offers o join public.jobs j on j.id = o.job_id where j.shop_id = p_shop_id),
    'first_job', exists (select 1 from public.jobs where shop_id = p_shop_id),
    'push', exists (select 1 from public.push_subscriptions where user_id = auth.uid()),
    'hidden', s.onboarding_hidden,
    'approved', s.status = 'approved'
  );
end $$;

create function public.set_onboarding_hidden(p_shop_id uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_shop_member(p_shop_id) then
    raise exception '우리 샵만 바꿀 수 있습니다' using errcode = '42501';
  end if;
  update public.shops set onboarding_hidden = coalesce(p_hidden, false) where id = p_shop_id;
end $$;

-- 강사 CSV 매칭. p_emails·p_phones는 같은 순서의 행(빈 값 허용). state:
--   mine(우리 전속) / invited(초대 보냄) / other_exclusive(다른 샵 전속, 초대 불가) / available(초대 가능) / null(가입 안 함)
-- 다른 샵 전속 강사는 어느 샵인지도, 강사 id도 주지 않는다.
create function public.import_match_instructors(p_shop_id uuid, p_emails text[], p_phones text[])
returns table (idx int, instructor_id uuid, name text, state text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_shop_member(p_shop_id) then
    raise exception '우리 샵만 쓸 수 있습니다' using errcode = '42501';
  end if;
  if coalesce(array_length(p_emails, 1), 0) > 300 or coalesce(array_length(p_phones, 1), 0) > 300 then
    raise exception '한 번에 300명까지 올릴 수 있습니다' using errcode = '22023';
  end if;
  return query
  with rows as (
    select i::int as idx,
           nullif(lower(btrim(coalesce(p_emails[i], ''))), '') as email,
           nullif(regexp_replace(coalesce(p_phones[i], ''), '\D', '', 'g'), '') as phone
    from generate_subscripts(coalesce(p_emails, p_phones), 1) i
  ),
  hit as (
    select distinct on (r.idx) r.idx, ins.id as iid, p.name
    from rows r
    join public.profiles p on p.role = 'instructor'
    join public.instructors ins on ins.user_id = p.id
    left join auth.users u on u.id = p.id
    where (r.email is not null and lower(u.email) = r.email)
       or (r.phone is not null and regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = r.phone)
    order by r.idx, (r.email is not null and lower(u.email) = r.email) desc
  )
  select r.idx,
         case when si.shop_id is not null and si.shop_id <> p_shop_id then null else h.iid end,
         h.name,
         case
           when h.iid is null then null
           when si.shop_id = p_shop_id then 'mine'
           when si.shop_id is not null then 'other_exclusive'
           when exists (select 1 from public.exclusive_invites e where e.shop_id = p_shop_id and e.instructor_id = h.iid and e.status = 'pending') then 'invited'
           else 'available'
         end
  from rows r
  left join hit h on h.idx = r.idx
  left join public.shop_instructors si on si.instructor_id = h.iid
  order by r.idx;
end $$;

revoke execute on function public.shop_onboarding(uuid) from public, anon;
revoke execute on function public.set_onboarding_hidden(uuid, boolean) from public, anon;
revoke execute on function public.import_match_instructors(uuid, text[], text[]) from public, anon;
grant execute on function public.shop_onboarding(uuid) to authenticated;
grant execute on function public.set_onboarding_hidden(uuid, boolean) to authenticated;
grant execute on function public.import_match_instructors(uuid, text[], text[]) to authenticated;
