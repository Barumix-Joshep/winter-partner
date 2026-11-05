-- 보안 12(감사 로그): 배정·입찰 선정·지급액 변경·취소·정산 발행/지급·벌점에 누가 언제 무엇을 했는지 남고, 기록은 고칠 수 없다 (pgTAP).
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

create function pg_temp.actor(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.has_event(p_action text, p_actor text) returns boolean language sql as $$
  select exists (select 1 from public.audit_events where action = p_action and actor_id::text = p_actor)
$$;

-- 샵1 관리자(최렌탈)가 한 일
select pg_temp.actor('a0000000-0000-0000-0000-000000000011');
insert into assignments (job_id, instructor_id, final_rate) values ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000021', 70000);
select ok(pg_temp.has_event('assignment_created', 'a0000000-0000-0000-0000-000000000011'), '배정: 누가 언제 누구를 얼마에 배정했는지 남는다');
update assignments set final_rate = 75000 where job_id = 'e0000000-0000-0000-0000-000000000002';
select is((select detail->>'old_rate' || '→' || (detail->>'new_rate') from audit_events where action = 'assignment_rate_changed'), '70000→75000', '지급액 변경: 이전·새 금액이 남는다');
update jobs set status = 'canceled', canceled_by = 'customer' where id = 'e0000000-0000-0000-0000-000000000002';
select ok(pg_temp.has_event('job_canceled', 'a0000000-0000-0000-0000-000000000011'), '취소: 누가 언제 취소했는지 남는다');
insert into settlements (id, shop_id, instructor_id, month, gross, withholding, net, status)
  values ('f0000000-0000-0000-0000-00000000d001', 'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000021', '2026-12-01', 80000, 2640, 77360, 'draft');
update settlements set status = 'issued' where id = 'f0000000-0000-0000-0000-00000000d001';
update settlements set status = 'paid', paid_at = now() where id = 'f0000000-0000-0000-0000-00000000d001';
select ok(pg_temp.has_event('settlement_issued', 'a0000000-0000-0000-0000-000000000011') and pg_temp.has_event('settlement_paid', 'a0000000-0000-0000-0000-000000000011'),
  '정산: 발행과 지급 완료를 누가 눌렀는지 남는다');

-- 샵2 공고에 들어온 입찰 선정 (시드에 열린 입찰이 없으면 하나 만든다)
insert into bids (job_id, bidder_type, instructor_id, amount)
  select 'e0000000-0000-0000-0000-000000000003', 'instructor', 'c0000000-0000-0000-0000-000000000022', 65000
  where not exists (select 1 from bids where job_id = 'e0000000-0000-0000-0000-000000000003' and status = 'open');
select pg_temp.actor('a0000000-0000-0000-0000-000000000012');
update bids set status = 'selected' where id = (select id from bids where job_id = 'e0000000-0000-0000-0000-000000000003' and status = 'open' limit 1);
select is((select (detail->>'amount')::int from audit_events where action = 'bid_selected'),
  (select amount from bids where job_id = 'e0000000-0000-0000-0000-000000000003' and status = 'selected'), '입찰 선정: 누가 어떤 금액의 입찰을 골랐는지 남는다');

-- 본사가 벌점을 주고, 고치고, 지운다
select pg_temp.actor('a0000000-0000-0000-0000-000000000001');
insert into instructor_penalties (id, instructor_id, reason, points) values ('f0000000-0000-0000-0000-00000000c001', 'c0000000-0000-0000-0000-000000000023', '[테스트] 일방 취소', 3);
update instructor_penalties set points = 1 where id = 'f0000000-0000-0000-0000-00000000c001';
delete from instructor_penalties where id = 'f0000000-0000-0000-0000-00000000c001';
select is((select array_agg(action order by created_at, action) from audit_events where target_id = 'f0000000-0000-0000-0000-00000000c001'),
  array['penalty_added', 'penalty_changed', 'penalty_deleted'], '벌점: 추가·변경·삭제가 모두 남는다');

-- 기록은 고칠 수도 지울 수도 없다 (본사·서비스 키 포함)
select throws_ok($$update audit_events set action = 'x'$$, '42501', null, '감사 기록은 고칠 수 없다');
select throws_ok($$delete from audit_events$$, '42501', null, '감사 기록은 지울 수 없다');

-- 샵은 자기 샵 기록만, 강사는 못 본다
select set_config('role', 'authenticated', true);
select pg_temp.actor('a0000000-0000-0000-0000-000000000011');
select ok((select count(*) from audit_events) > 0 and (select count(*) from audit_events where shop_id <> 'b0000000-0000-0000-0000-000000000001') = 0, '샵1은 자기 샵 기록만 본다');
select pg_temp.actor('a0000000-0000-0000-0000-000000000021');
select is((select count(*) from audit_events), 0::bigint, '강사는 감사 기록을 못 본다');
select throws_ok($$insert into audit_events (action) values ('fake')$$, '42501', null, '로그인 사용자가 기록을 직접 만들 수 없다');
reset role;

select * from finish();
rollback;
