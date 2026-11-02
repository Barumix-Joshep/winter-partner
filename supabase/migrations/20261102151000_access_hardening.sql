-- P18-3 권한 점검에서 찾은 문제 (보안 감사)
-- A1 (P0) 팀원이 API로 assignments.final_rate(팀 확정 금액)를 읽을 수 있었다. 화면만 가리고 DB는 열려 있었다.
--          → 팀원은 팀 강습 배정 행을 직접 못 읽고, 강사 화면은 금액을 비운 instructor_assignments 뷰로 본다.
-- A2 (P0) 샵이 shop_instructors.instructor_id를 직접 고쳐 아무 프리랜서나 동의 없이 전속으로 만들 수 있었다 → 수정 정책 삭제(앱은 쓰지 않음).
-- A3 (P1) 입찰자가 bids를 직접 고쳐 철회한 입찰을 되살리거나 금액을 상한 위로 바꿀 수 있었다 → 수정 정책 삭제(입찰·철회는 RPC로만).
-- A4 (P1) 강사가 승인된 자격증의 발급처·등급·파일을 직접 고칠 수 있었다(검증 안 된 값이 검증됨으로 보임) → 수정 정책 삭제(앱은 삭제 후 다시 올림).
-- A5 (P1) 본사 승인 전 샵도 강사 찾기·CSV 강사 대조(이메일·휴대폰 확인 수단)·직접 의뢰·입찰 공고를 RPC로 쓸 수 있었다 → 승인 샵만.
-- 되돌리기: 정책은 20261101135644_rls_policies.sql·20261101152000_exclusive_invites.sql, 함수는 각 원래 마이그레이션.

-- A1: 팀원에게는 팀 강습 배정 행을 직접 보여 주지 않는다. 강사 화면은 instructor_assignments 뷰로 본다
--     (자기 배정만, 팀 강습은 금액 칸이 비어 있다). 샵·팀·본사는 그대로 assignments를 본다.
drop policy assignee_read on assignments;
create policy assignee_read on assignments for select to authenticated
  using ((instructor_id = private.my_instructor_id() and via_shop_id is null) or private.is_shop_member(via_shop_id));

create view public.instructor_assignments with (security_barrier = true) as
  select a.id, a.job_id, a.instructor_id, a.via_shop_id,
         case when a.via_shop_id is null then a.final_rate end as final_rate,
         a.completed_at, a.lesson_note, a.approved_at
  from public.assignments a
  where a.instructor_id = private.my_instructor_id();
revoke all on public.instructor_assignments from public, anon;
grant select on public.instructor_assignments to authenticated;

-- A2·A3·A4
drop policy member_update on shop_instructors;
drop policy bidder_update on bids;
drop policy self_update on instructor_certs;

-- A5
-- private.is_approved_shop(s)는 20261101152000_exclusive_invites.sql에 이미 있다

create or replace function public.search_instructors(
  p_shop_id uuid,
  p_resort_id int,
  p_sport_id int default null,
  p_from timestamptz default null,  -- 둘 다 주면 이 시간에 강습 가능한 강사만
  p_to timestamptz default null
) returns table (
  instructor_id uuid,
  name text,
  level text,
  bio text,
  base_rate int,
  sports text[],
  resorts text[],
  certs text[],
  is_mine boolean,
  rating numeric,
  lesson_count int
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_shop_member(p_shop_id) then
    raise exception '이 샵의 멤버만 검색할 수 있습니다' using errcode = '42501';
  end if;
  if not private.is_approved_shop(p_shop_id) then
    raise exception '본사 승인 뒤에 쓸 수 있습니다' using errcode = '42501';
  end if;
  if not exists (select 1 from public.shop_resorts where shop_id = p_shop_id and resort_id = p_resort_id) then
    raise exception '영업 스키장에서만 검색할 수 있습니다' using errcode = '22023';
  end if;

  return query
  select
    i.id,
    p.name,
    i.level,
    i.bio,
    i.base_rate,
    array(select s.name from public.instructor_sports x join public.sports s on s.id = x.sport_id
          where x.instructor_id = i.id order by s.id),
    array(select r.name from public.instructor_resorts x join public.resorts r on r.id = x.resort_id
          where x.instructor_id = i.id order by r.id),
    array(select btrim(c.issuer || ' ' || coalesce(c.grade, '')) from public.instructor_certs c
          where c.instructor_id = i.id and c.status = 'approved' order by c.verified_at),
    si.shop_id is not null,
    (select round(avg(rt.score), 1) from public.ratings rt where rt.to_instructor_id = i.id),
    (select count(*)::int from public.assignments a where a.instructor_id = i.id and a.completed_at is not null)
  from public.instructors i
  join public.profiles p on p.id = i.user_id
  left join public.shop_instructors si on si.instructor_id = i.id and si.shop_id = p_shop_id
  where exists (select 1 from public.instructor_resorts x where x.instructor_id = i.id and x.resort_id = p_resort_id)
    and (p_sport_id is null or exists (select 1 from public.instructor_sports x where x.instructor_id = i.id and x.sport_id = p_sport_id))
    -- 다른 샵 전속은 제외 (우리 전속 + 프리랜서만)
    and not exists (select 1 from public.shop_instructors o where o.instructor_id = i.id and o.shop_id <> p_shop_id)
    and (p_from is null or p_to is null or (
      exists (select 1 from public.availability av
              where av.instructor_id = i.id and av.starts_at <= p_from and av.ends_at >= p_to)
      and not exists (select 1 from public.assignments a join public.jobs j on j.id = a.job_id
                      where a.instructor_id = i.id and j.status <> 'canceled'
                        and j.starts_at < p_to and j.ends_at > p_from)))
  order by si.shop_id is not null desc, 10 desc nulls last, 11 desc, p.name;
end $$;

create or replace function public.import_match_instructors(p_shop_id uuid, p_emails text[], p_phones text[])
returns table (idx int, instructor_id uuid, name text, state text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_shop_member(p_shop_id) then
    raise exception '우리 샵만 쓸 수 있습니다' using errcode = '42501';
  end if;
  if not private.is_approved_shop(p_shop_id) then
    raise exception '본사 승인 뒤에 쓸 수 있습니다' using errcode = '42501';
  end if;
  if coalesce(array_length(p_emails, 1), 0) > 300 or coalesce(array_length(p_phones, 1), 0) > 300 then
    raise exception '한 번에 300명까지 올릴 수 있습니다' using errcode = '22023';
  end if;
  return query
  with rows as (
    select i::int as idx,
           nullif(lower(btrim(coalesce(p_emails[i], ''))), '') as email,
           nullif(regexp_replace(coalesce(p_phones[i], ''), '\D', '', 'g'), '') as phone
    from generate_subscripts(coalesce(p_emails, p_phones), 1) i
  ),
  hit as (
    select distinct on (r.idx) r.idx, ins.id as iid, p.name
    from rows r
    join public.profiles p on p.role = 'instructor'
    join public.instructors ins on ins.user_id = p.id
    left join auth.users u on u.id = p.id
    where (r.email is not null and lower(u.email) = r.email)
       or (r.phone is not null and regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = r.phone)
    order by r.idx, (r.email is not null and lower(u.email) = r.email) desc
  )
  select r.idx,
         case when si.shop_id is not null and si.shop_id <> p_shop_id then null else h.iid end,
         h.name,
         case
           when h.iid is null then null
           when si.shop_id = p_shop_id then 'mine'
           when si.shop_id is not null then 'other_exclusive'
           when exists (select 1 from public.exclusive_invites e where e.shop_id = p_shop_id and e.instructor_id = h.iid and e.status = 'pending') then 'invited'
           else 'available'
         end
  from rows r
  left join hit h on h.idx = r.idx
  left join public.shop_instructors si on si.instructor_id = h.iid
  order by r.idx;
end $$;

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
  if not private.is_approved_shop(j.shop_id) then
    raise exception '본사 승인 뒤에 쓸 수 있습니다' using errcode = '42501';
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

create or replace function public.publish_bid_job(p_job_id uuid, p_closes_at timestamptz, p_allow_team boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare
  j public.jobs;
begin
  select * into j from public.jobs where id = p_job_id for update;
  if j.id is null or not private.is_shop_member(j.shop_id) then
    raise exception '이 샵의 강습이 아닙니다' using errcode = '42501';
  end if;
  if not private.is_approved_shop(j.shop_id) then
    raise exception '본사 승인 뒤에 쓸 수 있습니다' using errcode = '42501';
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
