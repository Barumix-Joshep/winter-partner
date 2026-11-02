-- P14-4 입찰 선정 보조: 공고를 낸 샵 멤버에게 입찰별 판단 재료를 모아 준다 (이미 DB에 있는 값만).
-- 평점·강습 횟수·검증 자격증·패널티·이 샵과의 지난 강습 수. 팀 입찰은 팀 기준(강습 수·이 샵과의 강습 수).
create function public.bid_assist_context(p_job_id uuid)
returns table (bid_id uuid, bidder_type text, amount int, memo text, rating numeric, lessons int, certs text[],
               penalty int, with_shop int, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  s uuid := private.job_shop_id(p_job_id);
begin
  if s is null or not private.is_shop_member(s) then
    raise exception '이 샵의 공고가 아닙니다' using errcode = '42501';
  end if;
  return query
  select b.id, b.bidder_type::text, b.amount, b.memo,
         (select round(avg(r.score)::numeric, 1) from public.ratings r where r.to_instructor_id = b.instructor_id),
         case when b.instructor_id is not null
              then (select count(*)::int from public.assignments a join public.jobs j on j.id = a.job_id
                    where a.instructor_id = b.instructor_id and j.status in ('done', 'approved'))
              else (select count(*)::int from public.assignments a join public.jobs j on j.id = a.job_id
                    where a.via_shop_id = b.bidder_shop_id and j.status in ('done', 'approved')) end,
         coalesce((select array_agg(c.issuer || coalesce(' ' || c.grade, '')) from public.instructor_certs c
                   where c.instructor_id = b.instructor_id and c.status = 'approved'), '{}'),
         coalesce((select i.penalty_points from public.instructors i where i.id = b.instructor_id), 0),
         (select count(*)::int from public.assignments a join public.jobs j on j.id = a.job_id
          where j.shop_id = s and j.status in ('done', 'approved')
            and (a.instructor_id = b.instructor_id or (b.bidder_shop_id is not null and a.via_shop_id = b.bidder_shop_id))),
         b.created_at
  from public.bids b
  where b.job_id = p_job_id and b.status = 'open'
  order by b.amount;
end $$;
revoke execute on function public.bid_assist_context(uuid) from public, anon;
grant execute on function public.bid_assist_context(uuid) to authenticated;
