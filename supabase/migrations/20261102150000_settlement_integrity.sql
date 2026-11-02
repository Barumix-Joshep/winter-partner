-- P18-1 정산 무결성 (시뮬레이션에서 찾은 문제)
-- F1 (P0) 팀 강습을 팀원 두 명 이상이 나눠 맡은 달에는 (instructor_id, via_shop_id)로 묶여 같은 팀 정산서가 두 번 들어가
--         settlements 고유 키에 걸려 그 샵의 월 정산 전체가 실패했다. → 팀 지급은 팀 기준으로만 묶는다.
-- F2 (P1) 그 달 정산서를 발행한 뒤 승인된 강습은 어느 정산서에도 들어가지 않았다. → 다음 달 집계로 이월한다.
-- F3      같은 배정이 두 정산서에 들어가는 것을 고유 색인으로 막는다.
-- F4      샵이 정산서 금액·상태와 항목을 REST로 직접 바꿀 수 있었다. → 읽기만, 발행은 issue_settlements로.
-- 되돌리기: 이전 generate_settlements는 20261101165000_settlements.sql, 정책은 20261101135644_rls_policies.sql.

create unique index settlement_items_one_per_assignment on settlement_items (assignment_id);

drop policy shop_all on settlements;
create policy shop_read on settlements for select to authenticated using (private.is_shop_member(shop_id));
drop policy shop_write on settlement_items;

create or replace function public.generate_settlements(p_shop_id uuid, p_month date)
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

  -- 이번 집계에서 대상이 사라진 draft는 지운다 (항목도 함께)
  delete from public.settlements s
  where s.shop_id = p_shop_id and s.month = m and s.status = 'draft';

  for r in
    with cand as (
      select a.id, a.final_rate, a.via_shop_id,
             case when a.via_shop_id is null then a.instructor_id end as payee_instructor
      from public.assignments a join public.jobs j on j.id = a.job_id
      where j.shop_id = p_shop_id and j.status = 'approved' and j.starts_at < m_to
        and not exists (select 1 from public.settlement_items si where si.assignment_id = a.id)
        and (j.starts_at >= m_from
             -- 이월: 지난달 강습인데 그 달 이 지급 대상의 정산서가 이미 발행·지급됐다(발행 뒤 승인)
             or exists (select 1 from public.settlements s
                        where s.shop_id = p_shop_id and s.status <> 'draft'
                          and s.month = date_trunc('month', j.starts_at at time zone 'Asia/Seoul')::date
                          and s.instructor_id is not distinct from (case when a.via_shop_id is null then a.instructor_id end)
                          and s.payee_shop_id is not distinct from a.via_shop_id))
    )
    select payee_instructor, via_shop_id, sum(final_rate)::int as gross, array_agg(id) as items, array_agg(final_rate) as amounts
    from cand
    group by payee_instructor, via_shop_id
  loop
    n := n + 1;
    -- 이미 발행·지급된 정산서는 건드리지 않는다 (남은 강습은 다음 달 집계로 이월된다)
    if exists (select 1 from public.settlements
               where shop_id = p_shop_id and month = m and status <> 'draft'
                 and instructor_id is not distinct from r.payee_instructor
                 and payee_shop_id is not distinct from r.via_shop_id) then
      continue;
    end if;
    insert into public.settlements (shop_id, instructor_id, payee_shop_id, month, gross, withholding, net, status)
    values (p_shop_id, r.payee_instructor, r.via_shop_id, m, r.gross,
            private.withholding_amount(r.gross, r.via_shop_id is null),
            r.gross - private.withholding_amount(r.gross, r.via_shop_id is null),
            'draft')
    returning id into sid;
    insert into public.settlement_items (settlement_id, assignment_id, amount)
    select sid, x.a, x.amt from unnest(r.items, r.amounts) as x(a, amt);
  end loop;
  return n;
end $$;

-- 정산서 발행: 그 달 draft를 issued로 (이전에는 화면이 테이블을 직접 고쳤다)
create function public.issue_settlements(p_shop_id uuid, p_month date)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not private.is_shop_member(p_shop_id) then
    raise exception '이 샵의 멤버만 정산서를 발행할 수 있습니다' using errcode = '42501';
  end if;
  update public.settlements set status = 'issued'
  where shop_id = p_shop_id and month = date_trunc('month', p_month)::date and status = 'draft';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.issue_settlements(uuid, date) from public, anon;
grant execute on function public.issue_settlements(uuid, date) to authenticated;
