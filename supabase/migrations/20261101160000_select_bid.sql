-- P4-4 관리자 선정과 금액 조정
-- 공고를 낸 샵의 멤버가 입찰 하나를 골라 확정한다. 금액은 그대로 쓰거나 조정하며, 확정 금액이 정산 기준이다.
-- 선정 시점에 강사의 다른 확정 강습과 시간이 겹치면 막는다. 나머지 입찰은 탈락 처리한다.
create function public.select_bid(p_bid_id uuid, p_final_rate int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  b public.bids;
  j public.jobs;
  assignment_id uuid;
begin
  select * into b from public.bids where id = p_bid_id for update;
  select * into j from public.jobs where id = b.job_id for update;
  if j.id is null or not private.is_shop_member(j.shop_id) then
    raise exception '이 샵의 공고가 아닙니다' using errcode = '42501';
  end if;
  if j.status <> 'open' or j.assign_mode <> 'bid' or b.status <> 'open' then
    raise exception '선정할 수 없는 공고나 입찰입니다' using errcode = '22023';
  end if;
  if p_final_rate is null or p_final_rate <= 0 then
    raise exception '확정 금액을 확인해 주세요' using errcode = '22023';
  end if;
  if b.instructor_id is not null and private.has_time_conflict(b.instructor_id, j.starts_at, j.ends_at, j.id) then
    raise exception '이 강사는 같은 시간에 다른 강습이 확정됐습니다' using errcode = '22023';
  end if;

  -- 팀 입찰이면 강사는 팀이 나중에 정한다 (via_shop_id)
  insert into public.assignments (job_id, instructor_id, via_shop_id, final_rate)
  values (j.id, b.instructor_id, case when b.bidder_type = 'shop' then b.bidder_shop_id end, p_final_rate)
  returning id into assignment_id;
  update public.jobs set status = 'assigned' where id = j.id;
  update public.bids set status = 'selected' where id = b.id;
  update public.bids set status = 'rejected' where job_id = j.id and id <> b.id and status = 'open';

  insert into public.notifications (user_id, kind, payload)
  select i.user_id, 'bid_selected', jsonb_build_object('job_id', j.id, 'amount', p_final_rate)
  from public.instructors i where i.id = b.instructor_id
  union all
  select m.user_id, 'bid_selected', jsonb_build_object('job_id', j.id, 'amount', p_final_rate)
  from public.shop_members m where b.bidder_type = 'shop' and m.shop_id = b.bidder_shop_id
  union all
  select i.user_id, 'bid_rejected', jsonb_build_object('job_id', j.id)
  from public.bids o join public.instructors i on i.id = o.instructor_id
  where o.job_id = j.id and o.id <> b.id and o.status = 'rejected';
  return assignment_id;
end $$;

-- 공고 내리기: 선정 전 공고를 임시 저장으로 되돌린다
create function public.unpublish_bid_job(p_job_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  j public.jobs;
begin
  select * into j from public.jobs where id = p_job_id for update;
  if j.id is null or not private.is_shop_member(j.shop_id) then
    raise exception '이 샵의 공고가 아닙니다' using errcode = '42501';
  end if;
  if j.status <> 'open' or j.assign_mode <> 'bid' then
    raise exception '진행 중인 입찰 공고가 아닙니다' using errcode = '22023';
  end if;
  update public.bids set status = 'rejected' where job_id = j.id and status = 'open';
  update public.jobs set status = 'draft', bid_closes_at = null where id = j.id;
end $$;

revoke execute on function public.select_bid(uuid, int) from public, anon;
revoke execute on function public.unpublish_bid_job(uuid) from public, anon;
grant execute on function public.select_bid(uuid, int) to authenticated;
grant execute on function public.unpublish_bid_job(uuid) to authenticated;
