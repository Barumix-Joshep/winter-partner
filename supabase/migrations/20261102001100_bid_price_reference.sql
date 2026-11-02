-- P14-8 입찰 금액 참고: 같은 스키장·종목·강습 유형에서 최근 30일 낙찰가의 중앙값·범위.
-- 다른 샵의 개별 거래가 드러나지 않게 3건 이상일 때만 숫자를 준다. 입찰 공고를 볼 수 있는 사람만(RLS로 보이는 공고).
create function public.bid_price_reference(p_job_id uuid)
returns table (samples int, median int, low int, high int)
language plpgsql stable security definer set search_path = '' as $$
declare
  j public.jobs;
  n int;
begin
  -- 호출한 사람이 이 공고를 볼 수 있어야 한다 (RLS 그대로 확인)
  if not exists (select 1 from public.jobs where id = p_job_id and (
       private.is_shop_member(shop_id) or private.has_job_link(id)
       or (status = 'open' and assign_mode = 'bid' and (
            (private.my_instructor_id() is not null and not private.is_exclusive())
            or (allow_team_bids and private.is_lesson_team_member()))))) then
    raise exception '볼 수 없는 공고입니다' using errcode = '42501';
  end if;
  select * into j from public.jobs where id = p_job_id;
  return query
  with won as (
    select a.final_rate
    from public.bids b
    join public.jobs x on x.id = b.job_id
    join public.assignments a on a.job_id = x.id
    where b.status = 'selected' and b.created_at > now() - interval '30 days'
      and x.id <> j.id and x.resort_id = j.resort_id and x.sport_id = j.sport_id and x.lesson_type = j.lesson_type
      and x.status <> 'canceled'
  )
  select count(*)::int,
         case when count(*) >= 3 then (percentile_cont(0.5) within group (order by final_rate))::int end,
         case when count(*) >= 3 then min(final_rate) end,
         case when count(*) >= 3 then max(final_rate) end
  from won;
end $$;
revoke execute on function public.bid_price_reference(uuid) from public, anon;
grant execute on function public.bid_price_reference(uuid) to authenticated;
