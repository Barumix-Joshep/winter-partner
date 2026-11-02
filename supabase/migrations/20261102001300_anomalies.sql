-- P14-10 규칙 기반 이상 패턴 (본사만). AI는 쓰지 않는다(요약만 화면에서 선택적으로).
-- 1) 강사 일방 취소: 최근 7일 2회 이상  2) 누적 패널티 5점 이상
-- 3) 샵이 입찰을 받고도 선정 없이 공고를 내린 일(입찰이 모두 rejected인 채 draft/취소): 최근 30일 3건 이상 — 직거래 의심 신호
create function public.admin_anomalies()
returns table (kind text, subject_type text, subject_id uuid, subject_name text, count int, last_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then
    raise exception '플랫폼 관리자만 볼 수 있습니다' using errcode = '42501';
  end if;
  return query
  select 'repeat_cancel'::text, 'instructor'::text, p.instructor_id, pr.name, count(*)::int, max(p.created_at)
  from public.instructor_penalties p
  join public.instructors i on i.id = p.instructor_id
  join public.profiles pr on pr.id = i.user_id
  where p.created_at > now() - interval '7 days'
  group by p.instructor_id, pr.name
  having count(*) >= 2
  union all
  select 'penalty_points', 'instructor', i.id, pr.name, i.penalty_points, null::timestamptz
  from public.instructors i join public.profiles pr on pr.id = i.user_id
  where i.penalty_points >= 5
  union all
  select 'bids_dropped', 'shop', j.shop_id, s.name, count(*)::int, max(j.created_at)
  from public.jobs j
  join public.shops s on s.id = j.shop_id
  where j.assign_mode = 'bid' and j.status in ('draft', 'canceled') and j.created_at > now() - interval '30 days'
    and exists (select 1 from public.bids b where b.job_id = j.id)
    and not exists (select 1 from public.bids b where b.job_id = j.id and b.status in ('open', 'selected'))
  group by j.shop_id, s.name
  having count(*) >= 3
  order by 5 desc;
end $$;

-- AI 요약용 숫자 (이름 없이): 최근 30일 강사 활동
create function public.admin_instructor_activity(p_instructor_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then
    raise exception '플랫폼 관리자만 볼 수 있습니다' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'bids_30d', (select count(*) from public.bids where instructor_id = p_instructor_id and created_at > now() - interval '30 days'),
    'bids_won_30d', (select count(*) from public.bids where instructor_id = p_instructor_id and status = 'selected' and created_at > now() - interval '30 days'),
    'lessons_done_30d', (select count(*) from public.assignments a join public.jobs j on j.id = a.job_id
                         where a.instructor_id = p_instructor_id and j.status in ('done', 'approved') and j.starts_at > now() - interval '30 days'),
    'cancels_30d', (select count(*) from public.instructor_penalties where instructor_id = p_instructor_id and created_at > now() - interval '30 days'),
    'penalty_points', (select penalty_points from public.instructors where id = p_instructor_id),
    'offers_declined_30d', (select count(*) from public.job_offers where instructor_id = p_instructor_id and status = 'declined' and responded_at > now() - interval '30 days'),
    'avg_rating', (select round(avg(score)::numeric, 1) from public.ratings where to_instructor_id = p_instructor_id)
  );
end $$;

revoke execute on function public.admin_anomalies() from public, anon;
revoke execute on function public.admin_instructor_activity(uuid) from public, anon;
grant execute on function public.admin_anomalies() to authenticated;
grant execute on function public.admin_instructor_activity(uuid) to authenticated;
