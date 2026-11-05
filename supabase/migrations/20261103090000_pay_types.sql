-- P19-1 강사별 지급 방식 (전속 원천징수 대비). 계획: docs/plans/P19-pay-type.md
-- 플랫폼은 세무 판단을 하지 않는다. "어떤 방식으로 지급되는지" 기록하고 정산서에 표시만 한다.
--   business_3_3  사업소득 3.3% (기본값 — 기존 동작 그대로)
--   none_by_shop  원천징수는 샵이 별도 처리 (플랫폼은 총액만, 원천세 0원)
-- 프리랜서(비전속)는 shop_instructors 행이 없으므로 항상 3.3%. 팀 정산(원천세 0)은 그대로.
-- 정산서에는 집계 시점 값을 복사한다(settlements.pay_type). 발행·지급된 정산서는 집계가 건드리지 않아 소급되지 않는다.
--
-- 되돌리기 (데이터 복구 불필요 — 이 마이그레이션은 기존 정산 금액을 바꾸지 않는다):
--   generate_settlements를 20261102150000_settlement_integrity.sql 정의로 다시 만들고
--   drop function public.set_instructor_pay_type(uuid, uuid, text);
--   drop table public.shop_instructor_pay_type_log;
--   alter table public.settlements drop column pay_type;
--   alter table public.shop_instructors drop column pay_type;
--   drop table public.pay_types;

create table public.pay_types (
  code text primary key,
  label text not null,
  withholds boolean not null,   -- 플랫폼이 3.3%를 떼는가
  sort int not null default 0
);
insert into public.pay_types (code, label, withholds, sort) values
  ('business_3_3', '사업소득 3.3%', true, 1),
  ('none_by_shop', '원천징수 샵 별도 처리', false, 2);
alter table public.pay_types enable row level security;
create policy read on public.pay_types for select to authenticated using (true);

-- 기존 전속 행은 모두 기본값으로 채워진다
alter table public.shop_instructors
  add column pay_type text not null default 'business_3_3' references public.pay_types(code);

-- 정산서에 집계 시점 지급 방식을 남긴다 (팀 지급은 null)
alter table public.settlements add column pay_type text references public.pay_types(code);
update public.settlements set pay_type = 'business_3_3' where payee_shop_id is null;

create table public.shop_instructor_pay_type_log (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  instructor_id uuid not null references public.instructors(id) on delete cascade,
  old_pay_type text not null references public.pay_types(code),
  new_pay_type text not null references public.pay_types(code),
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index on public.shop_instructor_pay_type_log (shop_id, changed_at desc);
alter table public.shop_instructor_pay_type_log enable row level security;
create policy shop_read on public.shop_instructor_pay_type_log for select to authenticated using (private.is_shop_member(shop_id));

-- 지급 방식 변경: 그 샵 관리자만, 그 샵 전속만, 이력 남김
create function public.set_instructor_pay_type(p_shop_id uuid, p_instructor_id uuid, p_pay_type text)
returns void language plpgsql security definer set search_path = '' as $$
declare old text;
begin
  if not private.is_shop_member(p_shop_id) then
    raise exception '이 샵의 관리자만 지급 방식을 바꿀 수 있습니다' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pay_types where code = p_pay_type) then
    raise exception '알 수 없는 지급 방식입니다' using errcode = '22023';
  end if;
  select pay_type into old from public.shop_instructors
  where shop_id = p_shop_id and instructor_id = p_instructor_id for update;
  if old is null then
    raise exception '전속 강사만 지급 방식을 바꿀 수 있습니다' using errcode = '22023';
  end if;
  if old = p_pay_type then return; end if;
  update public.shop_instructors set pay_type = p_pay_type
  where shop_id = p_shop_id and instructor_id = p_instructor_id;
  insert into public.shop_instructor_pay_type_log (shop_id, instructor_id, old_pay_type, new_pay_type, changed_by)
  values (p_shop_id, p_instructor_id, old, p_pay_type, auth.uid());
end $$;
revoke execute on function public.set_instructor_pay_type(uuid, uuid, text) from public, anon;
grant execute on function public.set_instructor_pay_type(uuid, uuid, text) to authenticated;

-- 정산 집계: 20261102150000_settlement_integrity.sql과 같고, 개인 강사는 지급 방식에 따라 원천세를 낸다
create or replace function public.generate_settlements(p_shop_id uuid, p_month date)
returns int language plpgsql security definer set search_path = '' as $$
declare
  m date := date_trunc('month', p_month)::date;
  m_from timestamptz := (m::text || ' 00:00 Asia/Seoul')::timestamptz;
  m_to timestamptz := ((m + interval '1 month')::date::text || ' 00:00 Asia/Seoul')::timestamptz;
  r record;
  sid uuid;
  pt text;
  wh int;
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
    if r.via_shop_id is null then
      -- 이 샵 전속이면 그 지급 방식, 아니면(프리랜서) 항상 3.3%
      pt := coalesce((select si.pay_type from public.shop_instructors si
                      where si.shop_id = p_shop_id and si.instructor_id = r.payee_instructor), 'business_3_3');
      wh := private.withholding_amount(r.gross, (select withholds from public.pay_types where code = pt));
    else
      pt := null;
      wh := 0;
    end if;
    insert into public.settlements (shop_id, instructor_id, payee_shop_id, month, gross, withholding, net, status, pay_type)
    values (p_shop_id, r.payee_instructor, r.via_shop_id, m, r.gross, wh, r.gross - wh, 'draft', pt)
    returning id into sid;
    insert into public.settlement_items (settlement_id, assignment_id, amount)
    select sid, x.a, x.amt from unnest(r.items, r.amounts) as x(a, amt);
  end loop;
  return n;
end $$;
