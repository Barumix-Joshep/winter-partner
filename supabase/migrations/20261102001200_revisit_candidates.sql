-- P14-9 재방문 후보: 광고 수신 동의가 유효한 손님만(customer_consent_state.valid), 익명화 제외.
-- 지난 시즌(11월~4월) 강습 횟수·마지막 레벨·마지막 강습일·종목. 샵 멤버만(RLS 그대로, security invoker).
create function public.revisit_candidates(p_shop_id uuid)
returns table (customer_id uuid, name text, level text, lessons int, last_lesson date, sport text)
language sql stable security invoker set search_path = '' as $$
  with last_season as (
    select private.season_of(now()) - case when extract(month from now() at time zone 'Asia/Seoul') between 5 and 10 then 0 else 1 end as s
  ),
  hist as (
    select jc.customer_id, j.starts_at, sp.name as sport
    from public.job_customers jc
    join public.jobs j on j.id = jc.job_id and j.status in ('done', 'approved')
    left join public.sports sp on sp.id = j.sport_id
    where j.shop_id = p_shop_id
  )
  select c.id, c.name, c.level,
         (select count(*)::int from hist h, last_season ls where h.customer_id = c.id and private.season_of(h.starts_at) = ls.s),
         (select max(h.starts_at at time zone 'Asia/Seoul')::date from hist h where h.customer_id = c.id),
         (select h.sport from hist h where h.customer_id = c.id order by h.starts_at desc limit 1)
  from public.customers c
  join public.customer_consent_state st on st.customer_id = c.id and st.kind = 'marketing' and st.valid
  where c.shop_id = p_shop_id and c.anonymized_at is null
    and exists (select 1 from hist h where h.customer_id = c.id)
  order by 4 desc, 5 desc nulls last
  limit 200
$$;
revoke execute on function public.revisit_candidates(uuid) from public, anon;
grant execute on function public.revisit_candidates(uuid) to authenticated;
