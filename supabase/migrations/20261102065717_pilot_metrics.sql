-- P16-7 시범 운영 지표 (본사만). 샵 단위 집계만 돌려준다: 손님·강사 이름이나 연락처는 없다.
-- 주간 등록 수는 한국 시간 월요일 시작, 최근 8주(오래된 주 → 이번 주). [테스트] 샵은 기본으로 뺀다.
create function public.admin_pilot_metrics(p_include_test boolean default false)
returns table (
  shop_id uuid, shop_name text, shop_type text, signed_up_at timestamptz, first_job_at timestamptz, hours_to_first_job numeric,
  jobs_total int, weekly jsonb, bid_jobs int, bid_participation_pct numeric, cancel_rate_pct numeric,
  ai_calls int, ai_calls_ok int, ai_features_used int, ai_cost_krw numeric
)
language plpgsql stable security definer set search_path = '' as $$
declare
  this_week date := date_trunc('week', (now() at time zone 'Asia/Seoul')::date)::date;
begin
  if not private.is_platform_admin() then
    raise exception '플랫폼 관리자만 볼 수 있습니다' using errcode = '42501';
  end if;
  return query
  with j as (
    select jb.shop_id, jb.id, jb.created_at, jb.assign_mode, jb.status,
           exists (select 1 from public.bids b where b.job_id = jb.id) as has_bid
    from public.jobs jb
  )
  select s.id, s.name, s.type::text, s.created_at,
         (select min(created_at) from j where j.shop_id = s.id),
         round(extract(epoch from (select min(created_at) from j where j.shop_id = s.id) - s.created_at) / 3600, 1),
         (select count(*)::int from j where j.shop_id = s.id),
         (select jsonb_agg((select count(*) from j where j.shop_id = s.id
                              and j.created_at >= ((this_week - 7 * g)::text || ' 00:00 Asia/Seoul')::timestamptz
                              and j.created_at < ((this_week - 7 * g + 7)::text || ' 00:00 Asia/Seoul')::timestamptz) order by g desc)
          from generate_series(0, 7) g),
         (select count(*)::int from j where j.shop_id = s.id and j.assign_mode = 'bid'),
         (select round(100.0 * count(*) filter (where j.has_bid) / nullif(count(*), 0), 0) from j where j.shop_id = s.id and j.assign_mode = 'bid'),
         (select round(100.0 * count(*) filter (where j.status = 'canceled') / nullif(count(*), 0), 0) from j where j.shop_id = s.id),
         (select count(*)::int from public.ai_usage u where u.shop_id = s.id),
         (select count(*)::int from public.ai_usage u where u.shop_id = s.id and u.ok),
         (select count(distinct u.feature)::int from public.ai_usage u where u.shop_id = s.id and u.ok),
         (select coalesce(sum(u.cost_krw), 0) from public.ai_usage u where u.shop_id = s.id)
  from public.shops s
  where p_include_test or s.name not like '[테스트]%'
  order by s.created_at;
end $$;
revoke execute on function public.admin_pilot_metrics(boolean) from public, anon;
grant execute on function public.admin_pilot_metrics(boolean) to authenticated;

-- 관리자 질의(admin_metric)에 시범 지표를 더한다
create or replace function public.admin_metric(p_metric text, p_month date)
returns table (label text, value numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  m_from timestamptz := (date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Seoul')::date))::date::text || ' 00:00 Asia/Seoul')::timestamptz;
  m_to timestamptz := ((date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Seoul')::date)) + interval '1 month')::date::text || ' 00:00 Asia/Seoul')::timestamptz;
begin
  if not private.is_platform_admin() then
    raise exception '플랫폼 관리자만 볼 수 있습니다' using errcode = '42501';
  end if;
  case p_metric
    when 'jobs_by_shop' then
      return query select s.name, count(*)::numeric from public.jobs j join public.shops s on s.id = j.shop_id
        where j.starts_at >= m_from and j.starts_at < m_to and j.status <> 'canceled' group by s.name order by 2 desc;
    when 'jobs_by_status' then
      return query select j.status::text, count(*)::numeric from public.jobs j where j.starts_at >= m_from and j.starts_at < m_to group by 1 order by 2 desc;
    when 'settlement_gross_by_shop' then
      return query select s.name, sum(st.gross)::numeric from public.settlements st join public.shops s on s.id = st.shop_id
        where st.month = m_from::date group by s.name order by 2 desc;
    when 'new_customers_by_shop' then
      return query select s.name, count(*)::numeric from public.customers c join public.shops s on s.id = c.shop_id
        where c.created_at >= m_from and c.created_at < m_to group by s.name order by 2 desc;
    when 'bid_win_rate' then
      return query select '입찰 수', count(*)::numeric from public.bids where created_at >= m_from and created_at < m_to
        union all select '선정 수', count(*) filter (where status = 'selected')::numeric from public.bids where created_at >= m_from and created_at < m_to;
    when 'new_instructors' then
      return query select '새 강사', count(*)::numeric from public.profiles where role = 'instructor' and created_at >= m_from and created_at < m_to;
    when 'customer_cancels_by_shop' then
      return query select s.name, count(*)::numeric from public.jobs j join public.shops s on s.id = j.shop_id
        where j.status = 'canceled' and j.starts_at >= m_from and j.starts_at < m_to group by s.name order by 2 desc;
    when 'instructor_cancels' then
      return query select pr.name, count(*)::numeric from public.instructor_penalties p join public.instructors i on i.id = p.instructor_id
        join public.profiles pr on pr.id = i.user_id where p.created_at >= m_from and p.created_at < m_to group by pr.name order by 2 desc;
    when 'active_shops' then
      return query select '강습이 있었던 샵', count(distinct j.shop_id)::numeric from public.jobs j where j.starts_at >= m_from and j.starts_at < m_to and j.status <> 'canceled';
    when 'ai_cost_by_feature' then
      return query select u.feature, round(sum(u.cost_krw), 0) from public.ai_usage u where u.created_at >= m_from and u.created_at < m_to group by 1 order by 2 desc;
    -- P16-7 시범 운영 지표 (월과 상관없이 지금 기준)
    when 'pilot_first_job_hours' then
      return query select p.shop_name, p.hours_to_first_job from public.admin_pilot_metrics(false) p where p.hours_to_first_job is not null order by 2;
    when 'pilot_weekly_jobs' then
      return query select to_char(w.wk, 'MM/DD') || ' 주', (select count(*) from public.jobs j join public.shops s on s.id = j.shop_id
          where s.name not like '[테스트]%' and j.created_at >= (w.wk::text || ' 00:00 Asia/Seoul')::timestamptz
            and j.created_at < ((w.wk + 7)::text || ' 00:00 Asia/Seoul')::timestamptz)::numeric
        from (select (date_trunc('week', (now() at time zone 'Asia/Seoul')::date) - make_interval(weeks => g))::date as wk
              from generate_series(7, 0, -1) g) w order by w.wk;
    when 'bid_participation_by_shop' then
      return query select p.shop_name, p.bid_participation_pct from public.admin_pilot_metrics(false) p where p.bid_participation_pct is not null order by 2 desc;
    when 'cancel_rate_by_shop' then
      return query select p.shop_name, p.cancel_rate_pct from public.admin_pilot_metrics(false) p where p.cancel_rate_pct is not null order by 2 desc;
    when 'ai_calls_by_shop' then
      return query select p.shop_name, p.ai_calls::numeric from public.admin_pilot_metrics(false) p where p.ai_calls > 0 order by 2 desc;
    else
      raise exception '모르는 집계입니다: %', p_metric using errcode = '22023';
  end case;
end $$;
