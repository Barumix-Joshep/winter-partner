-- P5-4 취소 규칙
-- 손님 취소·샵 사정 취소(샵이 기록): 강습 canceled, 배정 강사에게 즉시 알림, 정산 제외(승인 강습만 정산).
-- 강사 일방 취소: 배정을 빼서 정산에서 제외하고, 강습은 draft로 돌려 샵이 다시 배정한다.
--   instructor_penalties에 점수를 남긴다: 강습 시작 24시간 안이면 3점, 그 전이면 1점.
-- 완료 보고(done) 뒤에는 취소할 수 없다.

-- 시스템 함수가 관리자 전용 열(penalty_points)을 바꿀 수 있게 하는 트랜잭션 한정 표시.
-- PostgREST로는 set_config를 부를 수 없어 사용자가 켤 수 없다.
create or replace function private.guard_admin_columns() returns trigger
language plpgsql security definer set search_path = '' as $$
declare col text;
begin
  if auth.uid() is null or private.is_platform_admin() or current_setting('app.system_write', true) = 'on' then
    return new;
  end if;
  foreach col in array tg_argv loop
    if to_jsonb(new) -> col is distinct from to_jsonb(old) -> col then
      raise exception '플랫폼 관리자만 바꿀 수 있는 값입니다: %', col using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

create function private.penalty_points_for(p_starts timestamptz) returns int
language sql stable as $$ select case when p_starts - now() < interval '24 hours' then 3 else 1 end $$;

create function public.cancel_job(p_job_id uuid, p_by text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  j public.jobs;
begin
  select * into j from public.jobs where id = p_job_id for update;
  if j.id is null or not private.is_shop_member(j.shop_id) then
    raise exception '이 샵의 강습이 아닙니다' using errcode = '42501';
  end if;
  if p_by not in ('customer', 'shop') then
    raise exception '손님 취소 또는 샵 사정만 기록할 수 있습니다' using errcode = '22023';
  end if;
  if j.status in ('done', 'approved', 'canceled') then
    raise exception '취소할 수 없는 상태입니다' using errcode = '22023';
  end if;

  update public.jobs
  set status = 'canceled', canceled_by = p_by,
      note = case when nullif(btrim(p_reason), '') is null then note
                  else concat_ws(E'\n', note, '[취소] ' || btrim(p_reason)) end
  where id = j.id;
  update public.job_offers set status = 'expired' where job_id = j.id and status = 'pending';
  update public.bids set status = 'rejected' where job_id = j.id and status = 'open';

  insert into public.notifications (user_id, kind, payload)
  select i.user_id, 'job_canceled', jsonb_build_object('job_id', j.id, 'by', p_by)
  from public.assignments a join public.instructors i on i.id = a.instructor_id
  where a.job_id = j.id;
end $$;

create function public.instructor_cancel(p_job_id uuid, p_reason text)
returns int language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.my_instructor_id();
  j public.jobs;
  pts int;
begin
  select * into j from public.jobs where id = p_job_id for update;
  if me is null or not exists (select 1 from public.assignments where job_id = p_job_id and instructor_id = me) then
    raise exception '내가 맡은 강습이 아닙니다' using errcode = '42501';
  end if;
  if j.status <> 'assigned' then
    raise exception '취소할 수 없는 상태입니다' using errcode = '22023';
  end if;

  pts := private.penalty_points_for(j.starts_at);
  delete from public.assignments where job_id = j.id;
  update public.jobs set status = 'draft' where id = j.id;
  update public.job_offers set status = 'expired' where job_id = j.id and status in ('pending', 'accepted');

  insert into public.instructor_penalties (instructor_id, job_id, reason, points)
  values (me, j.id, coalesce(nullif(btrim(p_reason), ''), '강사 일방 취소'), pts);
  perform set_config('app.system_write', 'on', true);
  update public.instructors set penalty_points = penalty_points + pts where id = me;
  perform set_config('app.system_write', 'off', true);

  insert into public.notifications (user_id, kind, payload)
  select m.user_id, 'instructor_canceled', jsonb_build_object('job_id', j.id)
  from public.shop_members m where m.shop_id = j.shop_id;
  return pts;
end $$;

revoke execute on function public.cancel_job(uuid, text, text) from public, anon;
revoke execute on function public.instructor_cancel(uuid, text) from public, anon;
grant execute on function public.cancel_job(uuid, text, text) to authenticated;
grant execute on function public.instructor_cancel(uuid, text) to authenticated;
