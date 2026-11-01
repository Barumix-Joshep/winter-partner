-- P4-2 직접 의뢰와 강사 수락·거절
-- 의뢰: 샵 멤버가 draft(또는 응답 대기) 강습을 강사 한 명에게 보낸다. 대기 중인 이전 의뢰는 만료시킨다.
-- 응답: 강사 본인만. 수락하면 배정(assignments)을 만들고, 다른 샵 강습과 시간이 겹치면 막는다.
-- 알림 행(notifications)을 함께 남긴다. 실제 발송(웹푸시·알림톡)은 나중에 이 행을 읽어 보낸다.

-- 강습 시간이 겹치는 확정 강습이 있는가 (취소 제외)
create function private.has_time_conflict(p_instructor uuid, p_starts timestamptz, p_ends timestamptz, p_except_job uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assignments a join public.jobs j on j.id = a.job_id
    where a.instructor_id = p_instructor and j.id <> p_except_job and j.status <> 'canceled'
      and j.starts_at < p_ends and j.ends_at > p_starts)
$$;

create function public.send_job_offer(p_job_id uuid, p_instructor_id uuid, p_hours int default 24)
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

create function public.respond_job_offer(p_offer_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  o public.job_offers;
  j public.jobs;
  me uuid := private.my_instructor_id();
begin
  select * into o from public.job_offers where id = p_offer_id for update;
  if me is null or o.id is null or o.instructor_id <> me then
    raise exception '내가 받은 의뢰가 아닙니다' using errcode = '42501';
  end if;
  if o.status <> 'pending' or (o.expires_at is not null and o.expires_at < now()) then
    raise exception '이미 끝난 의뢰입니다' using errcode = '22023';
  end if;
  select * into j from public.jobs where id = o.job_id for update;
  if j.status <> 'open' or exists (select 1 from public.assignments where job_id = j.id) then
    raise exception '이미 배정된 강습입니다' using errcode = '22023';
  end if;

  if p_accept then
    if private.has_time_conflict(me, j.starts_at, j.ends_at, j.id) then
      raise exception '같은 시간에 다른 강습이 있습니다' using errcode = '22023';
    end if;
    insert into public.assignments (job_id, instructor_id, final_rate) values (j.id, me, j.instructor_rate);
    update public.jobs set status = 'assigned' where id = j.id;
    update public.job_offers set status = 'accepted', responded_at = now() where id = o.id;
  else
    update public.job_offers set status = 'declined', responded_at = now() where id = o.id;
    update public.jobs set status = 'draft' where id = j.id;   -- 샵이 다른 강사에게 다시 보내거나 공고로 낸다
  end if;

  insert into public.notifications (user_id, kind, payload)
  select m.user_id, case when p_accept then 'offer_accepted' else 'offer_declined' end,
         jsonb_build_object('job_id', j.id, 'offer_id', o.id)
  from public.shop_members m where m.shop_id = j.shop_id;
end $$;

-- 강사는 손님의 레벨만 본다 (이름·연락처 제외). 의뢰·배정으로 엮인 강사만.
create function public.job_customer_levels(p_job_id uuid)
returns table (level text) language sql stable security definer set search_path = '' as $$
  select c.level from public.job_customers jc join public.customers c on c.id = jc.customer_id
  where jc.job_id = p_job_id
    and (private.has_job_link(p_job_id) or private.is_shop_member(c.shop_id))
$$;

revoke execute on function public.send_job_offer(uuid, uuid, int) from public, anon;
revoke execute on function public.respond_job_offer(uuid, boolean) from public, anon;
revoke execute on function public.job_customer_levels(uuid) from public, anon;
grant execute on function public.send_job_offer(uuid, uuid, int) to authenticated;
grant execute on function public.respond_job_offer(uuid, boolean) to authenticated;
grant execute on function public.job_customer_levels(uuid) to authenticated;
