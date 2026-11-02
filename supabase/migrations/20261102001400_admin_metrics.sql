-- P14-11 관리자 질의: 미리 정의한 집계 10개 중 하나를 고른다(AI는 고르기만, SQL을 만들지 않는다). 본사만.
create function public.admin_metric(p_metric text, p_month date)
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
    else
      raise exception '모르는 집계입니다: %', p_metric using errcode = '22023';
  end case;
end $$;
revoke execute on function public.admin_metric(text, date) from public, anon;
grant execute on function public.admin_metric(text, date) to authenticated;
