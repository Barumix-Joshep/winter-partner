-- P12-5 손님 카드: 연락 기록과 다음 연락 목적 (프로토타입 Customer "다음 연락 · 연락 기록")
-- 샵 관리자만 보고 쓴다. 강사에게는 공개하지 않는다(연락처·영업 정보).
alter table customers add column next_contact_note text;

create table customer_contacts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  channel text not null check (channel in ('phone', 'message', 'visit', 'other')),
  memo text check (char_length(memo) <= 500),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on customer_contacts (customer_id, created_at desc);

alter table customer_contacts enable row level security;
create policy platform_admin_all on customer_contacts for all to authenticated
  using (private.is_platform_admin()) with check (private.is_platform_admin());
create policy member_read on customer_contacts for select to authenticated
  using (private.is_shop_member(shop_id));
-- 잘못 남긴 기록은 지울 수 있다. 쓰기는 log_customer_contact로만.
create policy member_delete on customer_contacts for delete to authenticated
  using (private.is_shop_member(shop_id));

-- 연락을 기록하고 다음 연락일·목적을 함께 바꾼다 (비우면 '오늘 연락할 손님'에서 빠진다)
create function public.log_customer_contact(p_customer_id uuid, p_channel text, p_memo text, p_next_on date, p_next_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  c public.customers;
  cid uuid;
begin
  select * into c from public.customers where id = p_customer_id for update;
  if c.id is null or not private.is_shop_member(c.shop_id) then
    raise exception '우리 샵 손님이 아닙니다' using errcode = '42501';
  end if;
  if p_channel is null or p_channel not in ('phone', 'message', 'visit', 'other') then
    raise exception '연락 방법을 확인해 주세요' using errcode = '22023';
  end if;
  insert into public.customer_contacts (shop_id, customer_id, channel, memo, created_by)
  values (c.shop_id, c.id, p_channel, nullif(left(btrim(coalesce(p_memo, '')), 500), ''), auth.uid())
  returning id into cid;
  update public.customers
  set next_contact_on = p_next_on,
      next_contact_note = case when p_next_on is null then null else nullif(left(btrim(coalesce(p_next_note, '')), 100), '') end
  where id = c.id;
  return cid;
end $$;

revoke execute on function public.log_customer_contact(uuid, text, text, date, text) from public, anon;
grant execute on function public.log_customer_contact(uuid, text, text, date, text) to authenticated;
