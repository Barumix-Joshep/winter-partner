-- P2-3 샵·강습팀 등록: 샵과 영업 스키장을 한 트랜잭션으로 만든다.
-- security invoker라 RLS가 그대로 적용된다 (샵 관리자만, 승인 대기 상태로만 만들 수 있다).
-- 등록한 사람은 shops 트리거(add_shop_owner)가 owner로 넣는다.
create function public.create_shop(
  p_type shop_type,
  p_name text,
  p_business_no text,
  p_owner_name text,
  p_resort_ids int[]
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  new_id uuid;
begin
  if coalesce(array_length(p_resort_ids, 1), 0) = 0 then
    raise exception '영업 스키장을 하나 이상 골라 주세요' using errcode = '22023';
  end if;

  insert into public.shops (type, name, business_no, owner_name)
  values (p_type, btrim(p_name), nullif(btrim(p_business_no), ''), nullif(btrim(p_owner_name), ''))
  returning id into new_id;

  insert into public.shop_resorts (shop_id, resort_id)
  select new_id, r from unnest(p_resort_ids) as r
  on conflict do nothing;

  return new_id;
end $$;

revoke execute on function public.create_shop(shop_type, text, text, text, int[]) from public, anon;
grant execute on function public.create_shop(shop_type, text, text, text, int[]) to authenticated;
