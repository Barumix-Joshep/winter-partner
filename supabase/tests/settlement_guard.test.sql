-- P19-2 정산 무결성 후속 (pgTAP)
-- A 승인된 강습·배정은 표로 직접 못 고치고 정정 RPC(이력)로만 / B 금액 검증 / C 선정 때 전속 재확인 / D 승인 뒤 샵 유형·사업자번호는 본사 승인
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000019201', 'sg-i@t', '{"role":"instructor","name":"가드강사"}'),
  ('00000000-0000-0000-0000-000000019202', 'sg-j@t', '{"role":"instructor","name":"입찰강사"}'),
  ('00000000-0000-0000-0000-000000019203', 'sg-s@t', '{"role":"shop_admin","name":"가드샵"}'),
  ('00000000-0000-0000-0000-000000019204', 'sg-x@t', '{"role":"shop_admin","name":"남의샵"}'),
  ('00000000-0000-0000-0000-000000019205', 'sg-p@t', '{"role":"shop_admin","name":"새샵"}');
insert into shops (id, type, name, status, business_no) values
  ('10000000-0000-0000-0000-000000019203', 'rental_shop', '가드샵', 'approved', '111-11-11111'),
  ('10000000-0000-0000-0000-000000019204', 'rental_shop', '남의샵', 'approved', null),
  ('10000000-0000-0000-0000-000000019205', 'rental_shop', '새샵', 'pending', null);
insert into shop_members (shop_id, user_id, is_owner) values
  ('10000000-0000-0000-0000-000000019203', '00000000-0000-0000-0000-000000019203', true),
  ('10000000-0000-0000-0000-000000019204', '00000000-0000-0000-0000-000000019204', true),
  ('10000000-0000-0000-0000-000000019205', '00000000-0000-0000-0000-000000019205', true);
insert into shop_resorts (shop_id, resort_id) select '10000000-0000-0000-0000-000000019203', min(id) from resorts;
create function pg_temp.iid(u text) returns uuid language sql as $$ select id from instructors where user_id = u::uuid $$;
grant execute on function pg_temp.iid(text) to authenticated;
create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- 승인된 강습 J1(1/30 10시, 100,000), 아직 진행 중인 강습 J2(draft)
insert into jobs (id, shop_id, starts_at, ends_at, status, instructor_rate) values
  ('40000000-0000-0000-0000-000000019201', '10000000-0000-0000-0000-000000019203', '2027-01-30 10:00+09', '2027-01-30 12:00+09', 'approved', 100000),
  ('40000000-0000-0000-0000-000000019202', '10000000-0000-0000-0000-000000019203', '2027-02-10 10:00+09', '2027-02-10 12:00+09', 'draft', 100000);
select set_config('app.system_write', 'on', true);
insert into assignments (job_id, instructor_id, final_rate, approved_at) values
  ('40000000-0000-0000-0000-000000019201', pg_temp.iid('00000000-0000-0000-0000-000000019201'), 100000, now());
select set_config('app.system_write', 'off', true);

-- A. 승인 뒤 표 직접 수정 차단 -------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000019203');
select throws_ok($$update jobs set starts_at = '2027-02-01 10:00+09', ends_at = '2027-02-01 12:00+09' where id = '40000000-0000-0000-0000-000000019201'$$,
  '42501', null, '승인된 강습 시간을 표로 옮길 수 없다(정산 달 이동)');
select throws_ok($$update jobs set status = 'done' where id = '40000000-0000-0000-0000-000000019201'$$, '42501', null, '승인된 강습 상태를 표로 바꿀 수 없다');
select throws_ok($$delete from jobs where id = '40000000-0000-0000-0000-000000019201'$$, '42501', null, '승인된 강습을 지울 수 없다');
select throws_ok($$update assignments set final_rate = 1 where job_id = '40000000-0000-0000-0000-000000019201'$$, '42501', null, '승인된 배정 금액을 표로 바꿀 수 없다');
select throws_ok($$delete from assignments where job_id = '40000000-0000-0000-0000-000000019201'$$, '42501', null, '승인된 배정을 지울 수 없다');
select lives_ok($$update jobs set note = '주차 안내' where id = '40000000-0000-0000-0000-000000019201'$$, '승인된 강습도 메모는 고칠 수 있다');
select lives_ok($$update jobs set starts_at = '2027-02-10 11:00+09' where id = '40000000-0000-0000-0000-000000019202'$$, '승인 전 강습은 그대로 고칠 수 있다');

-- A. 정정 RPC ------------------------------------------------------------------
select throws_ok($$select correct_approved_lesson('40000000-0000-0000-0000-000000019201', '2027-01-30 10:00+09', '2027-01-30 13:00+09', 120000, '  ')$$,
  '22023', '정정 사유를 적어 주세요', '사유 없이는 정정할 수 없다');
select throws_ok($$select correct_approved_lesson('40000000-0000-0000-0000-000000019201', '2027-01-30 10:00+09', '2027-01-30 09:00+09', 120000, '시간 착오')$$,
  '22023', null, '끝이 시작보다 빠르면 거부');
select throws_ok($$select correct_approved_lesson('40000000-0000-0000-0000-000000019201', '2027-01-30 10:00+09', '2027-01-30 13:00+09', 0, '금액 착오')$$,
  '22023', '강사 지급액은 1원 이상 1,000만 원 이하로 입력해 주세요', '0원 정정 거부');
select generate_settlements('10000000-0000-0000-0000-000000019203', '2027-01-01');
select lives_ok($$select correct_approved_lesson('40000000-0000-0000-0000-000000019201', '2027-01-30 10:00+09', '2027-01-30 13:00+09', 120000, '1시간 연장')$$,
  '샵 관리자는 사유와 함께 정정할 수 있다');
select is((select a.final_rate || '/' || to_char(j.ends_at at time zone 'Asia/Seoul', 'HH24:MI') from assignments a join jobs j on j.id = a.job_id where j.id = '40000000-0000-0000-0000-000000019201'),
  '120000/13:00', '정정 값이 반영된다');
select is((select (old_values ->> 'final_rate') || '>' || (new_values ->> 'final_rate') || ':' || reason || ':' || (changed_by = '00000000-0000-0000-0000-000000019203')::text from lesson_corrections),
  '100000>120000:1시간 연장:true', '정정 이력: 이전·새 값, 사유, 바꾼 사람');
select is((select count(*) from settlements where shop_id = '10000000-0000-0000-0000-000000019203' and status = 'draft'), 0::bigint, '정정하면 그 강습이 든 집계(draft)는 지워 다시 집계하게 한다');
select generate_settlements('10000000-0000-0000-0000-000000019203', '2027-01-01');
select is((select gross from settlements where shop_id = '10000000-0000-0000-0000-000000019203'), 120000, '다시 집계하면 정정 금액');
select issue_settlements('10000000-0000-0000-0000-000000019203', '2027-01-01');
select throws_ok($$select correct_approved_lesson('40000000-0000-0000-0000-000000019201', '2027-01-30 10:00+09', '2027-01-30 13:00+09', 90000, '할인')$$,
  '22023', '발행된 정산서에 들어간 강습은 고칠 수 없습니다', '발행 뒤에는 정정 불가');
select pg_temp.login('00000000-0000-0000-0000-000000019204');
select throws_ok($$select correct_approved_lesson('40000000-0000-0000-0000-000000019201', '2027-01-30 10:00+09', '2027-01-30 13:00+09', 90000, '침입')$$,
  '42501', null, '다른 샵은 정정할 수 없다');
select is((select count(*) from lesson_corrections), 0::bigint, '다른 샵은 정정 이력을 못 본다');

-- B. 금액 검증 -----------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000019203');
select throws_ok($$select create_job('10000000-0000-0000-0000-000000019203', (select min(id) from resorts), null, '2027-03-01 10:00+09', '2027-03-01 12:00+09', 'private', 1, null, 0, null, null, null, null)$$,
  '22023', '강사 지급액은 1원 이상 1,000만 원 이하로 입력해 주세요', '강사 지급액 0원 거부');
select throws_ok($$select create_job('10000000-0000-0000-0000-000000019203', (select min(id) from resorts), null, '2027-03-01 10:00+09', '2027-03-01 12:00+09', 'private', 1, null, 2000000000, null, null, null, null)$$,
  '22023', '강사 지급액은 1원 이상 1,000만 원 이하로 입력해 주세요', '아주 큰 금액은 안내 메시지');
select throws_ok($$select create_job('10000000-0000-0000-0000-000000019203', (select min(id) from resorts), null, '2027-03-01 10:00+09', '2027-03-01 12:00+09', 'private', 1, -5, 100000, null, null, null, null)$$,
  '22023', '손님 강습료는 0원 이상 1,000만 원 이하로 입력해 주세요', '음수 강습료 거부');
select throws_ok($$update jobs set instructor_rate = -1 where id = '40000000-0000-0000-0000-000000019202'$$, '23514', null, '표로 음수 지급액을 넣을 수 없다');

-- C. 선정 때 전속 재확인·금액 검증 --------------------------------------------
reset role;
update jobs set status = 'open', assign_mode = 'bid' where id = '40000000-0000-0000-0000-000000019202';
insert into bids (id, job_id, bidder_type, instructor_id, amount) values
  ('50000000-0000-0000-0000-000000019201', '40000000-0000-0000-0000-000000019202', 'instructor', pg_temp.iid('00000000-0000-0000-0000-000000019202'), 90000);
select pg_temp.login('00000000-0000-0000-0000-000000019203');
select throws_ok($$select select_bid('50000000-0000-0000-0000-000000019201', 0)$$, '22023', '강사 지급액은 1원 이상 1,000만 원 이하로 입력해 주세요', '선정 금액 0원 거부');
select throws_ok($$select select_bid('50000000-0000-0000-0000-000000019201', 2000000000)$$, '22023', '강사 지급액은 1원 이상 1,000만 원 이하로 입력해 주세요', '선정 금액 상한');
reset role;
insert into shop_instructors (shop_id, instructor_id) values ('10000000-0000-0000-0000-000000019204', pg_temp.iid('00000000-0000-0000-0000-000000019202'));
select pg_temp.login('00000000-0000-0000-0000-000000019203');
select throws_ok($$select select_bid('50000000-0000-0000-0000-000000019201', 90000)$$, '22023', '전속 강사가 된 강사의 입찰은 선정할 수 없습니다', '입찰 뒤 전속이 된 강사는 선정 거부');

-- D. 승인 뒤 샵 유형·사업자번호 ------------------------------------------------
select throws_ok($$update shops set business_no = '999-99-99999' where id = '10000000-0000-0000-0000-000000019203'$$, '42501', null, '승인 뒤 사업자번호는 직접 못 바꾼다');
select throws_ok($$update shops set type = 'lesson_team' where id = '10000000-0000-0000-0000-000000019203'$$, '42501', null, '승인 뒤 샵 유형은 직접 못 바꾼다');
select lives_ok($$select request_shop_change('10000000-0000-0000-0000-000000019203', null, '999-99-99999')$$, '본사에 변경을 요청할 수 있다');
select pg_temp.login('00000000-0000-0000-0000-000000019205');
select lives_ok($$update shops set business_no = '555-55-55555' where id = '10000000-0000-0000-0000-000000019205'$$, '승인 전 샵은 직접 고칠 수 있다');
select pg_temp.login('00000000-0000-0000-0000-000000019204');
select lives_ok($$update shops set business_no = '222-22-22222' where id = '10000000-0000-0000-0000-000000019204'$$, '승인 뒤라도 비어 있던 사업자번호를 처음 적는 것은 된다');
-- 본사가 승인하면 반영
reset role;
select set_config('app.system_write', 'on', true);
update profiles set role = 'platform_admin' where id = '00000000-0000-0000-0000-000000019204';
select set_config('app.system_write', 'off', true);
select pg_temp.login('00000000-0000-0000-0000-000000019204');
select decide_shop_change((select id from shop_change_requests where shop_id = '10000000-0000-0000-0000-000000019203'), true);
select is((select business_no || '/' || type from shops where id = '10000000-0000-0000-0000-000000019203'), '999-99-99999/rental_shop', '본사 승인 뒤 사업자번호가 바뀐다');

select * from finish();
rollback;
