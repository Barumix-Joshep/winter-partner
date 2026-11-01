-- P6-3 지급 완료 체크: 송금은 샵이 직접 하고, 시스템은 "지급 완료" 표시만 한다.
-- 발행(issued)된 정산서만 지급 완료로 바꿀 수 있고, 잘못 눌렀으면 발행 상태로 되돌린다. 받는 사람에게 알린다.
create function public.set_settlement_paid(p_settlement_id uuid, p_paid boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.settlements;
begin
  select * into s from public.settlements where id = p_settlement_id for update;
  if s.id is null or not private.is_shop_member(s.shop_id) then
    raise exception '이 샵의 정산서가 아닙니다' using errcode = '42501';
  end if;
  if p_paid and s.status <> 'issued' then
    raise exception '발행된 정산서만 지급 완료로 표시할 수 있습니다' using errcode = '22023';
  end if;
  if not p_paid and s.status <> 'paid' then
    raise exception '지급 완료 상태가 아닙니다' using errcode = '22023';
  end if;

  update public.settlements
  set status = case when p_paid then 'paid' else 'issued' end::public.pay_status,
      paid_at = case when p_paid then now() end
  where id = s.id;

  if p_paid then
    insert into public.notifications (user_id, kind, payload)
    select i.user_id, 'settlement_paid', jsonb_build_object('settlement_id', s.id, 'net', s.net)
    from public.instructors i where i.id = s.instructor_id
    union all
    select m.user_id, 'settlement_paid', jsonb_build_object('settlement_id', s.id, 'net', s.net)
    from public.shop_members m where m.shop_id = s.payee_shop_id;
  end if;
end $$;

revoke execute on function public.set_settlement_paid(uuid, boolean) from public, anon;
grant execute on function public.set_settlement_paid(uuid, boolean) to authenticated;
