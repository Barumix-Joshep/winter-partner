-- P11-5 2단계 팀 입찰
-- 강습팀(lesson_team)이 팀 입찰을 허용한 공고에 팀 이름으로 입찰한다. 선정되면 배정은 팀(via_shop_id)에 가고
-- 강사는 비어 있다. 팀장이 자기 팀 전속 강사 중 한 명을 지정한다. 정산은 공고 샵 → 팀(payee_shop_id, 원천세 0)으로
-- 나가고(generate_settlements), 팀원에게는 팀이 따로 준다.

-- 내가 멤버인 승인된 강습팀 (1단계: 관리자당 샵 하나)
create function private.my_lesson_team() returns uuid
language sql stable security definer set search_path = '' as $$
  select s.id from public.shop_members m join public.shops s on s.id = m.shop_id
  where m.user_id = auth.uid() and s.type = 'lesson_team' and s.status = 'approved'
  limit 1
$$;

create function public.place_team_bid(p_job_id uuid, p_amount int, p_memo text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  team uuid := private.my_lesson_team();
  j public.jobs;
  bid_id uuid;
begin
  if team is null then
    raise exception '승인된 강습팀만 팀 입찰을 할 수 있습니다' using errcode = '42501';
  end if;
  select * into j from public.jobs where id = p_job_id for update;
  if j.id is null or j.status <> 'open' or j.assign_mode <> 'bid' or not j.allow_team_bids or j.shop_id = team then
    raise exception '팀 입찰을 받는 공고가 아닙니다' using errcode = '22023';
  end if;
  if j.bid_closes_at is not null and j.bid_closes_at <= now() then
    raise exception '마감된 공고입니다' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > j.instructor_rate then
    raise exception '금액은 상한가 이하로 제시해 주세요' using errcode = '22023';
  end if;

  update public.bids set amount = p_amount, memo = nullif(btrim(p_memo), ''), created_at = now()
  where job_id = j.id and bidder_shop_id = team and status = 'open'
  returning id into bid_id;
  if bid_id is null then
    insert into public.bids (job_id, bidder_type, bidder_shop_id, amount, memo)
    values (j.id, 'shop', team, p_amount, nullif(btrim(p_memo), ''))
    returning id into bid_id;
    insert into public.notifications (user_id, kind, payload)
    select m.user_id, 'bid_placed', jsonb_build_object('job_id', j.id) from public.shop_members m where m.shop_id = j.shop_id;
  end if;
  return bid_id;
end $$;

create function public.withdraw_team_bid(p_job_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.bids set status = 'withdrawn'
  where job_id = p_job_id and bidder_shop_id = private.my_lesson_team() and status = 'open';
end $$;

-- 시스템 함수가 배정 강사를 바꿀 수 있게 (팀원 지정·팀원 취소). PostgREST로는 켤 수 없다.
create or replace function private.guard_assignment_columns() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or private.is_platform_admin() or private.is_shop_member(private.job_shop_id(old.job_id))
     or current_setting('app.system_write', true) = 'on' then
    return new;
  end if;
  if (new.job_id, new.instructor_id, new.via_shop_id, new.final_rate, new.approved_at, new.approved_by)
     is distinct from (old.job_id, old.instructor_id, old.via_shop_id, old.final_rate, old.approved_at, old.approved_by) then
    raise exception '강사는 완료 시각과 강습 노트만 바꿀 수 있습니다' using errcode = '42501';
  end if;
  return new;
end $$;

-- 팀장이 팀 배정 강습에 팀원(우리 팀 전속 강사)을 지정하거나 바꾼다. 완료 보고 전까지.
create function public.assign_team_instructor(p_job_id uuid, p_instructor_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.assignments;
  j public.jobs;
  inst_user uuid;
begin
  select * into a from public.assignments where job_id = p_job_id for update;
  if a.id is null or a.via_shop_id is null or not private.is_shop_member(a.via_shop_id) then
    raise exception '우리 팀이 맡은 강습이 아닙니다' using errcode = '42501';
  end if;
  select * into j from public.jobs where id = p_job_id;
  if j.status <> 'assigned' or a.completed_at is not null then
    raise exception '팀원을 바꿀 수 없는 상태입니다' using errcode = '22023';
  end if;
  if not exists (select 1 from public.shop_instructors where shop_id = a.via_shop_id and instructor_id = p_instructor_id) then
    raise exception '우리 팀 전속 강사만 지정할 수 있습니다' using errcode = '22023';
  end if;
  if private.has_time_conflict(p_instructor_id, j.starts_at, j.ends_at, j.id) then
    raise exception '이 팀원은 같은 시간에 다른 강습이 있습니다' using errcode = '22023';
  end if;

  perform set_config('app.system_write', 'on', true);
  update public.assignments set instructor_id = p_instructor_id where id = a.id;
  perform set_config('app.system_write', 'off', true);

  select user_id into inst_user from public.instructors where id = p_instructor_id;
  insert into public.notifications (user_id, kind, payload)
  values (inst_user, 'team_assigned', jsonb_build_object('job_id', j.id));
end $$;

-- 강사 일방 취소: 팀 배정이면 배정은 팀에 남기고 강사만 비운다 (팀장이 다시 지정). 나머지는 기존과 같다.
create or replace function public.instructor_cancel(p_job_id uuid, p_reason text)
returns int language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.my_instructor_id();
  j public.jobs;
  a public.assignments;
  pts int;
begin
  select * into j from public.jobs where id = p_job_id for update;
  select * into a from public.assignments where job_id = p_job_id and instructor_id = me;
  if me is null or a.id is null then
    raise exception '내가 맡은 강습이 아닙니다' using errcode = '42501';
  end if;
  if j.status <> 'assigned' then
    raise exception '취소할 수 없는 상태입니다' using errcode = '22023';
  end if;

  pts := private.penalty_points_for(j.starts_at);
  if a.via_shop_id is not null then
    perform set_config('app.system_write', 'on', true);
    update public.assignments set instructor_id = null where id = a.id;
    perform set_config('app.system_write', 'off', true);
  else
    delete from public.assignments where job_id = j.id;
    update public.jobs set status = 'draft' where id = j.id;
    update public.job_offers set status = 'expired' where job_id = j.id and status in ('pending', 'accepted');
  end if;

  insert into public.instructor_penalties (instructor_id, job_id, reason, points)
  values (me, j.id, coalesce(nullif(btrim(p_reason), ''), '강사 일방 취소'), pts);
  perform set_config('app.system_write', 'on', true);
  update public.instructors set penalty_points = penalty_points + pts where id = me;
  perform set_config('app.system_write', 'off', true);

  -- 팀 배정이면 팀장에게, 아니면 공고 샵에
  insert into public.notifications (user_id, kind, payload)
  select m.user_id, 'instructor_canceled', jsonb_build_object('job_id', j.id)
  from public.shop_members m where m.shop_id = coalesce(a.via_shop_id, j.shop_id);
  return pts;
end $$;

revoke execute on function public.place_team_bid(uuid, int, text) from public, anon;
revoke execute on function public.withdraw_team_bid(uuid) from public, anon;
revoke execute on function public.assign_team_instructor(uuid, uuid) from public, anon;
grant execute on function public.place_team_bid(uuid, int, text) to authenticated;
grant execute on function public.withdraw_team_bid(uuid) to authenticated;
grant execute on function public.assign_team_instructor(uuid, uuid) to authenticated;
