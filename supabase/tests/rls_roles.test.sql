-- 보안 2(RLS): rls_matrix.test.sql이 다루지 않는 표를 역할별로 막는지 (pgTAP).
-- shop1(하이원 스노우렌탈) 강습·전속·정산 자료를 다른 샵·강습팀·프리랜서가 못 보고 못 고치며,
-- 김스키 개인 자료(알림·푸시·벌점·정산·입찰·제안·초대·대기 자격증)를 다른 강사(박스키)가 못 본다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- 빈 표로 통과하지 않게 데모 기록을 만든다 (postgres로)
insert into lesson_corrections (job_id, shop_id, old_values, new_values, reason)
  values ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '{}', '{}', '[테스트] 정정');
insert into shop_change_requests (shop_id, old_type, new_business_no)
  select id, type, '000-00-00000' from shops where id = 'b0000000-0000-0000-0000-000000000001';
insert into shop_instructor_pay_type_log (shop_id, instructor_id, old_pay_type, new_pay_type)
  values ('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000024', 'business_3_3', 'none_by_shop');
insert into push_subscriptions (user_id, endpoint, p256dh, auth)
  values ('a0000000-0000-0000-0000-000000000021', 'https://push.example/kim', 'k', 'a');
insert into instructor_penalties (instructor_id, reason) values ('c0000000-0000-0000-0000-000000000021', '[테스트] 일방 취소');
insert into instructor_certs (instructor_id, issuer, status) values ('c0000000-0000-0000-0000-000000000021', '[테스트] 대기 자격증', 'pending');
insert into notifications (user_id, kind) values ('a0000000-0000-0000-0000-000000000021', 'test');
insert into bids (job_id, bidder_type, instructor_id, amount)
  values ('e0000000-0000-0000-0000-000000000003', 'instructor', 'c0000000-0000-0000-0000-000000000021', 70000);
insert into settlements (id, shop_id, instructor_id, month, gross, withholding, net, status)
  values ('f0000000-0000-0000-0000-00000000a201', 'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000021', '2026-12-01', 80000, 2640, 77360, 'draft');
insert into settlement_items (settlement_id, assignment_id, amount)
  select 'f0000000-0000-0000-0000-00000000a201', id, 80000 from assignments where instructor_id = 'c0000000-0000-0000-0000-000000000021' limit 1;
insert into exclusive_invites (shop_id, instructor_id) values ('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000021');

-- uid로 q를 실행한 행 수 (권한 오류는 0)
create function pg_temp.seen(uid text, q text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  begin execute q into n; exception when insufficient_privilege then n := 0; end;
  reset role;
  return n;
end $$;

-- 보이면 안 되는 표:개수를 모은다
create function pg_temp.leaks(uid text, probes text[][]) returns text[] language plpgsql as $$
declare i int; n bigint; out text[] := '{}';
begin
  for i in 1 .. array_length(probes, 1) loop
    n := pg_temp.seen(uid, probes[i][2]);
    if n > 0 then out := out || (probes[i][1] || ':' || n); end if;
  end loop;
  return out;
end $$;

create temp table shop1_probes as select array[
  ['job_prices', $q$select count(*) from job_prices where job_id in (select id from jobs where shop_id = 'b0000000-0000-0000-0000-000000000001')$q$],
  ['job_customers', $q$select count(*) from job_customers where job_id in (select id from jobs where shop_id = 'b0000000-0000-0000-0000-000000000001')$q$],
  ['assignments', $q$select count(*) from assignments where job_id in (select id from jobs where shop_id = 'b0000000-0000-0000-0000-000000000001')$q$],
  ['bids', $q$select count(*) from bids where job_id in (select id from jobs where shop_id = 'b0000000-0000-0000-0000-000000000001')$q$],
  ['job_offers', $q$select count(*) from job_offers where job_id in (select id from jobs where shop_id = 'b0000000-0000-0000-0000-000000000001')$q$],
  ['shop_members', $q$select count(*) from shop_members where shop_id = 'b0000000-0000-0000-0000-000000000001'$q$],
  ['shop_instructors', $q$select count(*) from shop_instructors where shop_id = 'b0000000-0000-0000-0000-000000000001'$q$],
  ['shop_change_requests', $q$select count(*) from shop_change_requests where shop_id = 'b0000000-0000-0000-0000-000000000001'$q$],
  ['pay_type_log', $q$select count(*) from shop_instructor_pay_type_log where shop_id = 'b0000000-0000-0000-0000-000000000001'$q$],
  ['lesson_corrections', $q$select count(*) from lesson_corrections where shop_id = 'b0000000-0000-0000-0000-000000000001'$q$],
  ['settlement_items', $q$select count(*) from settlement_items where settlement_id = 'f0000000-0000-0000-0000-00000000a201'$q$]
]::text[][] as p;
grant select on shop1_probes to authenticated;

select ok(pg_temp.seen('a0000000-0000-0000-0000-000000000011', $q$select count(*) from shop_instructor_pay_type_log$q$) > 0
  and pg_temp.seen('a0000000-0000-0000-0000-000000000011', $q$select count(*) from assignments$q$) > 0, 'shop1 관리자는 자기 자료를 본다 (점검 대상 데이터가 있다)');

-- 1~2) 다른 샵·강습팀은 shop1 강습·전속·정산 자료를 하나도 못 본다
select is(pg_temp.leaks('a0000000-0000-0000-0000-000000000012', (select p from shop1_probes)), '{}'::text[], '다른 샵(용평 알파인샵)은 shop1 자료를 못 본다');
select is(pg_temp.leaks('a0000000-0000-0000-0000-000000000013', (select p from shop1_probes)), '{}'::text[], '강습팀(평창 라이딩스쿨)은 shop1 자료를 못 본다');

-- 3) 강사는 손님 강습료·손님 연결·전속 관계·변경 요청·지급 방식 이력·정정 이력을 못 본다 (자기 배정 강습이어도)
select is(pg_temp.leaks('a0000000-0000-0000-0000-000000000021', array[
  ['job_prices', $q$select count(*) from job_prices$q$],
  ['job_customers', $q$select count(*) from job_customers$q$],
  ['shop_members', $q$select count(*) from shop_members$q$],
  ['shop_change_requests', $q$select count(*) from shop_change_requests$q$],
  ['pay_type_log', $q$select count(*) from shop_instructor_pay_type_log$q$],
  ['lesson_corrections', $q$select count(*) from lesson_corrections$q$]
]::text[][]), '{}'::text[], '프리랜서(김스키)는 샵 내부 자료를 못 본다');

-- 4) 다른 강사(박스키)는 김스키 개인 자료를 못 본다
select is(pg_temp.leaks('a0000000-0000-0000-0000-000000000023', array[
  ['notifications', $q$select count(*) from notifications where user_id = 'a0000000-0000-0000-0000-000000000021'$q$],
  ['push_subscriptions', $q$select count(*) from push_subscriptions where user_id = 'a0000000-0000-0000-0000-000000000021'$q$],
  ['instructor_penalties', $q$select count(*) from instructor_penalties where instructor_id = 'c0000000-0000-0000-0000-000000000021'$q$],
  ['settlements', $q$select count(*) from settlements where instructor_id = 'c0000000-0000-0000-0000-000000000021'$q$],
  ['settlement_items', $q$select count(*) from settlement_items where settlement_id = 'f0000000-0000-0000-0000-00000000a201'$q$],
  ['bids', $q$select count(*) from bids where instructor_id = 'c0000000-0000-0000-0000-000000000021'$q$],
  ['job_offers', $q$select count(*) from job_offers where instructor_id = 'c0000000-0000-0000-0000-000000000021'$q$],
  ['assignments', $q$select count(*) from assignments where instructor_id = 'c0000000-0000-0000-0000-000000000021'$q$],
  ['exclusive_invites', $q$select count(*) from exclusive_invites where instructor_id = 'c0000000-0000-0000-0000-000000000021'$q$],
  ['pending_certs', $q$select count(*) from instructor_certs where instructor_id = 'c0000000-0000-0000-0000-000000000021' and status <> 'approved'$q$]
]::text[][]), '{}'::text[], '다른 강사(박스키)는 김스키 개인 자료를 못 본다');

-- 5) 김스키 본인은 자기 자료를 본다 (위 차단이 빈 표 때문이 아님)
select ok(pg_temp.seen('a0000000-0000-0000-0000-000000000021', $q$select count(*) from notifications$q$) > 0
  and pg_temp.seen('a0000000-0000-0000-0000-000000000021', $q$select count(*) from bids$q$) > 0
  and pg_temp.seen('a0000000-0000-0000-0000-000000000021', $q$select count(*) from settlement_items$q$) > 0
  and pg_temp.seen('a0000000-0000-0000-0000-000000000021', $q$select count(*) from exclusive_invites$q$) > 0
  and pg_temp.seen('a0000000-0000-0000-0000-000000000021', $q$select count(*) from instructor_certs where status = 'pending' and instructor_id = 'c0000000-0000-0000-0000-000000000021'$q$) > 0,
  '김스키 본인은 자기 알림·입찰·정산 항목·초대·대기 자격증을 본다');

-- 6) 전속 강사(오전속)는 입찰 공고(어느 샵이든)를 못 본다
select ok(pg_temp.seen('a0000000-0000-0000-0000-000000000021', $q$select count(*) from jobs where assign_mode = 'bid' and status = 'open'$q$) > 0
  and pg_temp.seen('a0000000-0000-0000-0000-000000000024', $q$select count(*) from jobs where assign_mode = 'bid'$q$) = 0,
  '전속 강사는 입찰 공고를 못 본다 (프리랜서에게는 보이는 공고)');

-- 7~11) 쓰기: ID를 알아도 남의 행을 못 고친다 (RLS로 0행)
create function pg_temp.touched(uid text, q text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  begin execute q; get diagnostics n = row_count;
  exception when insufficient_privilege or check_violation or raise_exception then n := 0; end;
  reset role;
  return n;
end $$;

select is(pg_temp.touched('a0000000-0000-0000-0000-000000000012',
  $q$update jobs set note = '[테스트] 남의 강습' where shop_id = 'b0000000-0000-0000-0000-000000000001'$q$), 0::bigint, '다른 샵은 shop1 강습을 못 고친다');
select is(pg_temp.touched('a0000000-0000-0000-0000-000000000012',
  $q$delete from job_prices where job_id in (select id from jobs where shop_id = 'b0000000-0000-0000-0000-000000000001')$q$), 0::bigint, '다른 샵은 shop1 강습료를 못 지운다');
select is(pg_temp.touched('a0000000-0000-0000-0000-000000000023',
  $q$update notifications set read_at = now() where user_id = 'a0000000-0000-0000-0000-000000000021'$q$), 0::bigint, '다른 강사는 김스키 알림을 못 고친다');
select is(pg_temp.touched('a0000000-0000-0000-0000-000000000023',
  $q$delete from availability where instructor_id = 'c0000000-0000-0000-0000-000000000021'$q$), 0::bigint, '다른 강사는 김스키 가용 시간을 못 지운다');
select is(pg_temp.touched('a0000000-0000-0000-0000-000000000021',
  $q$update settlements set paid_at = now() where instructor_id = 'c0000000-0000-0000-0000-000000000021'$q$), 0::bigint, '강사는 자기 정산서도 "지급 완료"로 못 바꾼다');

select * from finish();
rollback;
