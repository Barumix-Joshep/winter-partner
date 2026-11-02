-- P17-2 종목 규칙: 강사가 하지 않는 종목의 강습은 직접 의뢰(send_job_offer)·입찰(place_bid)·팀원 지정(assign_team_instructor)을 막는다.
-- 이전에는 샵의 강사 찾기(search_instructors)에서만 종목을 걸렀다. 종목이 비어 있는 예전 강습은 막지 않는다.
-- 함수 본문은 이전 정의(job_offers, bids, team_bids 마이그레이션)와 같고 종목 검사만 더했다.

create or replace function public.send_job_offer(p_job_id uuid, p_instructor_id uuid, p_hours int default 24)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  j public.jobs;
  offer_id uuid;
  inst_user uuid;
begin
  select * into j from public.jobs where id = p_job_id for update;
  if j.id is null or not private.is_shop_member(j.shop_id) then
    raise exception '이 샵의 강습이 아닙니다' using errcode = '42501';
  end if;
  if not (j.status = 'draft' or (j.status = 'open' and j.assign_mode = 'direct')) then
    raise exception '의뢰할 수 없는 상태입니다' using errcode = '22023';
  end if;
  if j.instructor_rate is null then
    raise exception '강사 지급액을 먼저 정해 주세요' using errcode = '22023';
  end if;
  if exists (select 1 from public.shop_instructors where instructor_id = p_instructor_id and shop_id <> j.shop_id) then
    raise exception '다른 샵 전속 강사입니다' using errcode = '22023';
  end if;
  if j.sport_id is not null and not exists (select 1 from public.instructor_sports where instructor_id = p_instructor_id and sport_id = j.sport_id) then
    raise exception '이 종목을 하지 않는 강사입니다' using errcode = '22023';
  end if;
  select user_id into inst_user from public.instructors where id = p_instructor_id;
  if inst_user is null then
    raise exception '강사를 찾을 수 없습니다' using errcode = '22023';
  end if;

  update public.job_offers set status = 'expired' where job_id = j.id and status = 'pending';
  insert into public.job_offers (job_id, instructor_id, status, expires_at)
  values (j.id, p_instructor_id, 'pending', least(now() + make_interval(hours => p_hours), j.starts_at))
  on conflict (job_id, instructor_id) do update set status = 'pending', expires_at = excluded.expires_at, responded_at = null
  returning id into offer_id;
  update public.jobs set status = 'open', assign_mode = 'direct' where id = j.id;

  insert into public.notifications (user_id, kind, payload)
  values (inst_user, 'job_offer', jsonb_build_object('job_id', j.id, 'offer_id', offer_id));
  return offer_id;
end $$;

create or replace function public.place_bid(p_job_id uuid, p_amount int, p_memo text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.my_instructor_id();
  j public.jobs;
  bid_id uuid;
begin
  if me is null or private.is_exclusive() then
    raise exception '프리랜서 강사만 입찰할 수 있습니다' using errcode = '42501';
  end if;
  select * into j from public.jobs where id = p_job_id;
  if j.id is null or j.status <> 'open' or j.assign_mode <> 'bid' then
    raise exception '입찰 중인 공고가 아닙니다' using errcode = '22023';
  end if;
  if j.bid_closes_at is not null and j.bid_closes_at <= now() then
    raise exception '마감된 공고입니다' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > j.instructor_rate then
    raise exception '금액은 상한가 이하로 제시해 주세요' using errcode = '22023';
  end if;
  if j.sport_id is not null and not exists (select 1 from public.instructor_sports where instructor_id = me and sport_id = j.sport_id) then
    raise exception '이 종목을 하지 않는 강사입니다' using errcode = '22023';
  end if;
  if private.has_time_conflict(me, j.starts_at, j.ends_at, j.id) then
    raise exception '같은 시간에 확정된 강습이 있습니다' using errcode = '22023';
  end if;

  update public.bids set amount = p_amount, memo = nullif(btrim(p_memo), ''), created_at = now()
  where job_id = j.id and instructor_id = me and status = 'open'
  returning id into bid_id;
  if bid_id is null then
    insert into public.bids (job_id, bidder_type, instructor_id, amount, memo)
    values (j.id, 'instructor', me, p_amount, nullif(btrim(p_memo), ''))
    returning id into bid_id;
    insert into public.notifications (user_id, kind, payload)
    select m.user_id, 'bid_placed', jsonb_build_object('job_id', j.id, 'bid_id', bid_id)
    from public.shop_members m where m.shop_id = j.shop_id;
  end if;
  return bid_id;
end $$;

create or replace function public.assign_team_instructor(p_job_id uuid, p_instructor_id uuid)
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
  if j.sport_id is not null and not exists (select 1 from public.instructor_sports where instructor_id = p_instructor_id and sport_id = j.sport_id) then
    raise exception '이 종목을 하지 않는 강사입니다' using errcode = '22023';
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
