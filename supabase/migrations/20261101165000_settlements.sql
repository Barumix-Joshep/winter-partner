-- P6-1 월 정산 집계 (샵별·지급 대상별)
-- 대상: 그 달(한국 시간, 강습 시작 기준)에 샵이 승인(approved)한 강습. 취소·미승인 강습은 빠진다.
-- 지급 대상: 강사(개인) 또는 팀 입찰로 배정된 강습팀(payee_shop_id).
-- 원천세: 개인 강사는 사업소득 3.3% (소득세 3% + 지방세 = 소득세 10%, 각 10원 미만 절사, 소득세 1,000원 미만 소액부징수).
--          팀(사업자) 지급은 0. 계산은 src/lib/settlement/withholding.ts와 같다.
-- 다시 집계하면 draft만 새로 계산한다. 발행(issued)·지급(paid)된 정산서는 그대로 둔다.

-- 지급 대상이 같은 행을 하나로 (payee 열에 null이 있어 기본 unique로는 중복이 생긴다)
alter table settlements drop constraint settlements_shop_id_instructor_id_payee_shop_id_month_key;
alter table settlements add constraint settlements_payee_month_key
  unique nulls not distinct (shop_id, instructor_id, payee_shop_id, month);
alter table settlements add constraint settlements_one_payee
  check ((instructor_id is null) <> (payee_shop_id is null));

create function private.withholding_amount(p_gross int, p_applies boolean) returns int
language sql immutable as $$
  select case when not p_applies then 0 else
    (case when floor(p_gross * 3 / 100.0 / 10) * 10 < 1000 then 0 else floor(p_gross * 3 / 100.0 / 10) * 10 end)::int
    + (floor((case when floor(p_gross * 3 / 100.0 / 10) * 10 < 1000 then 0 else floor(p_gross * 3 / 100.0 / 10) * 10 end) / 10.0 / 10) * 10)::int
  end
$$;

create function public.generate_settlements(p_shop_id uuid, p_month date)
returns int language plpgsql security definer set search_path = '' as $$
declare
  m date := date_trunc('month', p_month)::date;
  m_from timestamptz := (m::text || ' 00:00 Asia/Seoul')::timestamptz;
  m_to timestamptz := ((m + interval '1 month')::date::text || ' 00:00 Asia/Seoul')::timestamptz;
  r record;
  sid uuid;
  n int := 0;
begin
  if not private.is_shop_member(p_shop_id) then
    raise exception '이 샵의 멤버만 정산을 집계할 수 있습니다' using errcode = '42501';
  end if;

  -- 이번 집계에서 대상이 사라진 draft는 지운다
  delete from public.settlements s
  where s.shop_id = p_shop_id and s.month = m and s.status = 'draft';

  for r in
    select a.instructor_id, a.via_shop_id, sum(a.final_rate)::int as gross, array_agg(a.id) as items, array_agg(a.final_rate) as amounts
    from public.assignments a join public.jobs j on j.id = a.job_id
    where j.shop_id = p_shop_id and j.status = 'approved'
      and j.starts_at >= m_from and j.starts_at < m_to
    group by a.instructor_id, a.via_shop_id
  loop
    n := n + 1;
    -- 이미 발행·지급된 정산서는 건드리지 않는다
    if exists (select 1 from public.settlements
               where shop_id = p_shop_id and month = m and status <> 'draft'
                 and instructor_id is not distinct from (case when r.via_shop_id is null then r.instructor_id end)
                 and payee_shop_id is not distinct from r.via_shop_id) then
      continue;
    end if;
    insert into public.settlements (shop_id, instructor_id, payee_shop_id, month, gross, withholding, net, status)
    values (p_shop_id,
            case when r.via_shop_id is null then r.instructor_id end,
            r.via_shop_id,
            m, r.gross,
            private.withholding_amount(r.gross, r.via_shop_id is null),
            r.gross - private.withholding_amount(r.gross, r.via_shop_id is null),
            'draft')
    returning id into sid;
    insert into public.settlement_items (settlement_id, assignment_id, amount)
    select sid, x.a, x.amt from unnest(r.items, r.amounts) as x(a, amt);
  end loop;
  return n;
end $$;

revoke execute on function public.generate_settlements(uuid, date) from public, anon;
grant execute on function public.generate_settlements(uuid, date) to authenticated;
