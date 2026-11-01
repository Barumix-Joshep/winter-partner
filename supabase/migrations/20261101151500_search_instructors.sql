-- P3-3 샵용 강사 찾기
-- 다른 샵 전속 강사를 빼려면 shop_instructors 전체를 봐야 하는데, 샵은 RLS로 자기 전속만 본다.
-- 그래서 security definer로 돌리되, 호출자가 p_shop_id의 멤버인지와 영업 스키장인지를 직접 확인한다.
-- 결과에는 연락처(전화·이메일)를 넣지 않는다.
create function public.search_instructors(
  p_shop_id uuid,
  p_resort_id int,
  p_sport_id int default null,
  p_from timestamptz default null,  -- 둘 다 주면 이 시간에 강습 가능한 강사만
  p_to timestamptz default null
) returns table (
  instructor_id uuid,
  name text,
  level text,
  bio text,
  base_rate int,
  sports text[],
  resorts text[],
  certs text[],
  is_mine boolean,
  rating numeric,
  lesson_count int
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_shop_member(p_shop_id) then
    raise exception '이 샵의 멤버만 검색할 수 있습니다' using errcode = '42501';
  end if;
  if not exists (select 1 from public.shop_resorts where shop_id = p_shop_id and resort_id = p_resort_id) then
    raise exception '영업 스키장에서만 검색할 수 있습니다' using errcode = '22023';
  end if;

  return query
  select
    i.id,
    p.name,
    i.level,
    i.bio,
    i.base_rate,
    array(select s.name from public.instructor_sports x join public.sports s on s.id = x.sport_id
          where x.instructor_id = i.id order by s.id),
    array(select r.name from public.instructor_resorts x join public.resorts r on r.id = x.resort_id
          where x.instructor_id = i.id order by r.id),
    array(select btrim(c.issuer || ' ' || coalesce(c.grade, '')) from public.instructor_certs c
          where c.instructor_id = i.id and c.status = 'approved' order by c.verified_at),
    si.shop_id is not null,
    (select round(avg(rt.score), 1) from public.ratings rt where rt.to_instructor_id = i.id),
    (select count(*)::int from public.assignments a where a.instructor_id = i.id and a.completed_at is not null)
  from public.instructors i
  join public.profiles p on p.id = i.user_id
  left join public.shop_instructors si on si.instructor_id = i.id and si.shop_id = p_shop_id
  where exists (select 1 from public.instructor_resorts x where x.instructor_id = i.id and x.resort_id = p_resort_id)
    and (p_sport_id is null or exists (select 1 from public.instructor_sports x where x.instructor_id = i.id and x.sport_id = p_sport_id))
    -- 다른 샵 전속은 제외 (우리 전속 + 프리랜서만)
    and not exists (select 1 from public.shop_instructors o where o.instructor_id = i.id and o.shop_id <> p_shop_id)
    and (p_from is null or p_to is null or (
      exists (select 1 from public.availability av
              where av.instructor_id = i.id and av.starts_at <= p_from and av.ends_at >= p_to)
      and not exists (select 1 from public.assignments a join public.jobs j on j.id = a.job_id
                      where a.instructor_id = i.id and j.status <> 'canceled'
                        and j.starts_at < p_to and j.ends_at > p_from)))
  order by si.shop_id is not null desc, 10 desc nulls last, 11 desc, p.name;
end $$;

revoke execute on function public.search_instructors(uuid, int, int, timestamptz, timestamptz) from public, anon;
grant execute on function public.search_instructors(uuid, int, int, timestamptz, timestamptz) to authenticated;
