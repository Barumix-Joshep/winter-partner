-- P4-3 입찰 공고와 금액 제시
-- 공고: draft 강습을 공개 입찰로. instructor_rate가 상한가, bid_closes_at이 마감(강습 시작 전).
-- 입찰: 전속이 아닌 강사 본인만, 상한 이하, 마감 전, 자기 확정 강습과 시간이 겹치지 않을 때. 강사당 한 건(다시 내면 갱신).
-- 공고 열람 제한(전속 비공개)은 jobs RLS(open_bids_read)가 맡는다.
create unique index bids_one_open_per_instructor on bids (job_id, instructor_id) where status = 'open' and instructor_id is not null;

create function public.publish_bid_job(p_job_id uuid, p_closes_at timestamptz, p_allow_team boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
  j public.jobs;
begin
  select * into j from public.jobs where id = p_job_id for update;
  if j.id is null or not private.is_shop_member(j.shop_id) then
    raise exception '이 샵의 강습이 아닙니다' using errcode = '42501';
  end if;
  if j.status <> 'draft' then
    raise exception '임시 저장한 강습만 공고할 수 있습니다' using errcode = '22023';
  end if;
  if j.instructor_rate is null then
    raise exception '입찰 상한가(강사 지급액)를 먼저 정해 주세요' using errcode = '22023';
  end if;
  if p_closes_at <= now() or p_closes_at > j.starts_at then
    raise exception '마감은 지금 이후, 강습 시작 전이어야 합니다' using errcode = '22023';
  end if;
  update public.jobs
  set status = 'open', assign_mode = 'bid', bid_closes_at = p_closes_at, allow_team_bids = coalesce(p_allow_team, false)
  where id = j.id;
end $$;

create function public.place_bid(p_job_id uuid, p_amount int, p_memo text)
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

create function public.withdraw_bid(p_job_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.bids set status = 'withdrawn'
  where job_id = p_job_id and instructor_id = private.my_instructor_id() and status = 'open'
$$;

revoke execute on function public.publish_bid_job(uuid, timestamptz, boolean) from public, anon;
revoke execute on function public.place_bid(uuid, int, text) from public, anon;
revoke execute on function public.withdraw_bid(uuid) from public, anon;
grant execute on function public.publish_bid_job(uuid, timestamptz, boolean) to authenticated;
grant execute on function public.place_bid(uuid, int, text) to authenticated;
grant execute on function public.withdraw_bid(uuid) to authenticated;
