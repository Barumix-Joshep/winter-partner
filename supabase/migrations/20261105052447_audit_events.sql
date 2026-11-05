-- 보안 12(감사 로그): 돈·평판에 걸린 결정을 누가 언제 무엇을 했는지 한 표(audit_events)에 남기고, 기록은 고칠 수 없게 한다.
-- 지금까지는 강습 정정(lesson_corrections)·지급 방식(shop_instructor_pay_type_log)·사업자 변경(shop_change_requests)·열람(access_logs)만 있었고
-- 배정·입찰 선정·지급액 변경·취소·정산 발행/지급·벌점은 누가 했는지 남지 않았다(벌점은 본사가 고치거나 지워도 흔적 없음).
-- 트리거로 남기므로 RPC·직접 쓰기·서비스 키 모두 같은 기록이 생긴다. actor_id = auth.uid()(시스템 작업은 null). 데이터 변경 없음(새 표만).
--
-- 되돌리기: drop trigger audit_assignments_ins on assignments; drop trigger audit_assignments_upd on assignments;
--   drop trigger audit_bids on bids; drop trigger audit_jobs on jobs; drop trigger audit_settlements on settlements;
--   drop trigger audit_penalties on instructor_penalties; drop table audit_events;
--   drop function private.audit(uuid, text, text, uuid, jsonb), private.audit_assignments(), private.audit_bids(), private.audit_jobs(),
--     private.audit_settlements(), private.audit_penalties(), private.audit_events_immutable();

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid, -- 외래 키 없음: 샵이 지워져도 기록은 남는다(고칠 수 없는 표라 set null도 못 한다)
  actor_id uuid,
  action text not null,
  target_table text,
  target_id uuid,
  detail jsonb not null default '{}',
  created_at timestamptz not null default clock_timestamp()
);
create index audit_events_shop_idx on public.audit_events (shop_id, created_at desc);
create index audit_events_target_idx on public.audit_events (target_id);
alter table public.audit_events enable row level security;
-- 읽기만: 그 샵 멤버와 본사. 쓰기 정책 없음 → 로그인 사용자는 직접 못 만든다(트리거 함수만 쓴다)
create policy member_read on public.audit_events for select to authenticated using (private.is_shop_member(shop_id));
create policy platform_admin_read on public.audit_events for select to authenticated using (private.is_platform_admin());
grant select on public.audit_events to authenticated;

-- 고치기·지우기 금지 (서비스 키·본사 포함). 보존 기간 정리가 필요해지면 access_logs처럼 별도 설정으로 연다
create function private.audit_events_immutable() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception '감사 기록은 고치거나 지울 수 없습니다' using errcode = '42501';
end $$;
create trigger audit_events_immutable before update or delete on public.audit_events
  for each row execute function private.audit_events_immutable();

create function private.audit(p_shop uuid, p_action text, p_table text, p_target uuid, p_detail jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_events (shop_id, actor_id, action, target_table, target_id, detail)
  values (p_shop, auth.uid(), p_action, p_table, p_target, coalesce(p_detail, '{}'));
$$;
revoke all on function private.audit(uuid, text, text, uuid, jsonb) from public, anon, authenticated;

-- 배정: 생성, 지급액·강사 변경, 강습 승인
create function private.audit_assignments() returns trigger language plpgsql security definer set search_path = '' as $$
declare s uuid := private.job_shop_id(new.job_id);
begin
  if tg_op = 'INSERT' then
    perform private.audit(s, 'assignment_created', 'assignments', new.id,
      jsonb_build_object('job_id', new.job_id, 'instructor_id', new.instructor_id, 'via_shop_id', new.via_shop_id, 'final_rate', new.final_rate));
  else
    if new.final_rate is distinct from old.final_rate then
      perform private.audit(s, 'assignment_rate_changed', 'assignments', new.id,
        jsonb_build_object('job_id', new.job_id, 'old_rate', old.final_rate, 'new_rate', new.final_rate));
    end if;
    if new.instructor_id is distinct from old.instructor_id then
      perform private.audit(s, 'assignment_instructor_changed', 'assignments', new.id,
        jsonb_build_object('job_id', new.job_id, 'old_instructor_id', old.instructor_id, 'new_instructor_id', new.instructor_id));
    end if;
    if new.approved_at is not null and old.approved_at is null then
      perform private.audit(s, 'lesson_approved', 'assignments', new.id, jsonb_build_object('job_id', new.job_id, 'final_rate', new.final_rate));
    end if;
  end if;
  return null;
end $$;
create trigger audit_assignments_ins after insert on public.assignments for each row execute function private.audit_assignments();
create trigger audit_assignments_upd after update on public.assignments for each row execute function private.audit_assignments();

-- 입찰 선정
create function private.audit_bids() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'selected' and old.status is distinct from 'selected' then
    perform private.audit(private.job_shop_id(new.job_id), 'bid_selected', 'bids', new.id,
      jsonb_build_object('job_id', new.job_id, 'amount', new.amount, 'instructor_id', new.instructor_id, 'bidder_shop_id', new.bidder_shop_id));
  end if;
  return null;
end $$;
create trigger audit_bids after update of status on public.bids for each row execute function private.audit_bids();

-- 강습 취소
create function private.audit_jobs() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'canceled' and old.status is distinct from 'canceled' then
    perform private.audit(new.shop_id, 'job_canceled', 'jobs', new.id,
      jsonb_build_object('canceled_by', new.canceled_by, 'previous_status', old.status, 'starts_at', new.starts_at));
  end if;
  return null;
end $$;
create trigger audit_jobs after update of status on public.jobs for each row execute function private.audit_jobs();

-- 정산서 발행·지급 완료·(발행 뒤) 금액 변경
create function private.audit_settlements() returns trigger language plpgsql security definer set search_path = '' as $$
declare d jsonb := jsonb_build_object('month', new.month, 'instructor_id', new.instructor_id, 'payee_shop_id', new.payee_shop_id, 'net', new.net);
begin
  if new.status is distinct from old.status then
    perform private.audit(new.shop_id, 'settlement_' || new.status::text, 'settlements', new.id, d || jsonb_build_object('previous_status', old.status));
  end if;
  if old.status <> 'draft' and (new.gross, new.withholding, new.net) is distinct from (old.gross, old.withholding, old.net) then
    perform private.audit(new.shop_id, 'settlement_amount_changed', 'settlements', new.id,
      d || jsonb_build_object('old_gross', old.gross, 'new_gross', new.gross, 'old_net', old.net));
  end if;
  return null;
end $$;
create trigger audit_settlements after update on public.settlements for each row execute function private.audit_settlements();

-- 벌점: 추가·변경·삭제
create function private.audit_penalties() returns trigger language plpgsql security definer set search_path = '' as $$
declare r public.instructor_penalties := coalesce(new, old);
begin
  perform private.audit(case when r.job_id is null then null else private.job_shop_id(r.job_id) end,
    case tg_op when 'INSERT' then 'penalty_added' when 'UPDATE' then 'penalty_changed' else 'penalty_deleted' end,
    'instructor_penalties', r.id,
    jsonb_build_object('instructor_id', r.instructor_id, 'job_id', r.job_id, 'points', r.points, 'reason', r.reason)
      || case when tg_op = 'UPDATE' then jsonb_build_object('old_points', old.points, 'old_reason', old.reason) else '{}' end);
  return null;
end $$;
create trigger audit_penalties after insert or update or delete on public.instructor_penalties
  for each row execute function private.audit_penalties();
