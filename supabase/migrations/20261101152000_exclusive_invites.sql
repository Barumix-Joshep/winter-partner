-- P3-4 전속 강사 등록: 샵이 제안하고 강사가 수락해야 전속이 된다.
-- 전속이 되면 프리랜서 활동(입찰·입찰 공고 열람)이 막히므로, 샵이 일방적으로 묶을 수 없게 한다.
create type invite_status as enum ('pending', 'accepted', 'declined', 'canceled');

create table exclusive_invites (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  instructor_id uuid not null references instructors(id) on delete cascade,
  exclusive_rate int,
  status invite_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create unique index on exclusive_invites (shop_id, instructor_id) where status = 'pending';
create index on exclusive_invites (instructor_id) where status = 'pending';

create function private.is_exclusive_instructor(i uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shop_instructors where instructor_id = i)
$$;

-- 승인된 샵만 제안한다 (승인 전 샵은 강사에게 보이지 않는다)
create function private.is_approved_shop(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shops where id = s and status = 'approved')
$$;

alter table exclusive_invites enable row level security;

create policy platform_admin_all on exclusive_invites for all to authenticated
  using (private.is_platform_admin()) with check (private.is_platform_admin());
create policy shop_read on exclusive_invites for select to authenticated
  using (private.is_shop_member(shop_id));
create policy shop_invite on exclusive_invites for insert to authenticated
  with check (private.is_shop_member(shop_id) and private.is_approved_shop(shop_id) and status = 'pending'
              and not private.is_exclusive_instructor(instructor_id));
create policy shop_cancel on exclusive_invites for update to authenticated
  using (private.is_shop_member(shop_id)) with check (private.is_shop_member(shop_id) and status = 'canceled');
create policy instructor_read on exclusive_invites for select to authenticated
  using (instructor_id = private.my_instructor_id());
-- 강사는 거절만 직접. 수락은 accept_exclusive_invite로 (전속 등록·입찰 철회를 함께 해야 한다)
create policy instructor_decline on exclusive_invites for update to authenticated
  using (instructor_id = private.my_instructor_id())
  with check (instructor_id = private.my_instructor_id() and status = 'declined');

-- 샵은 전속을 직접 만들 수 없다 (조회·해지만). 강사 본인 해지(self_leave)는 그대로.
drop policy member_write on shop_instructors;
create policy member_release on shop_instructors for delete to authenticated
  using (private.is_shop_member(shop_id));
create policy member_update on shop_instructors for update to authenticated
  using (private.is_shop_member(shop_id)) with check (private.is_shop_member(shop_id));

create function public.accept_exclusive_invite(p_invite_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.my_instructor_id();
  inv public.exclusive_invites;
begin
  select * into inv from public.exclusive_invites where id = p_invite_id for update;
  if me is null or inv.id is null or inv.instructor_id <> me then
    raise exception '내가 받은 제안이 아닙니다' using errcode = '42501';
  end if;
  if inv.status <> 'pending' then
    raise exception '이미 처리된 제안입니다' using errcode = '22023';
  end if;
  if private.is_exclusive_instructor(me) then
    raise exception '이미 다른 샵의 전속입니다. 먼저 해지해 주세요' using errcode = '22023';
  end if;

  insert into public.shop_instructors (shop_id, instructor_id, exclusive_rate)
  values (inv.shop_id, me, inv.exclusive_rate);
  update public.exclusive_invites set status = 'accepted', responded_at = now() where id = inv.id;
  -- 전속은 프리랜서 입찰을 할 수 없다
  update public.bids set status = 'withdrawn' where instructor_id = me and status = 'open';
  update public.exclusive_invites set status = 'declined', responded_at = now()
  where instructor_id = me and status = 'pending' and id <> inv.id;
end $$;

revoke execute on function public.accept_exclusive_invite(uuid) from public, anon;
grant execute on function public.accept_exclusive_invite(uuid) to authenticated;
