-- P17-2 종목 규칙 (pgTAP): 강사가 하지 않는 종목의 강습은 직접 의뢰·입찰·팀원 지정이 막힌다. 복수 종목 강사는 종목마다 검색된다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.sport(n text) returns int language sql as $$ select id from public.sports where name = n $$;

-- 하이원 스노우렌탈: 스노우스케이트 강습(직접), 용평 알파인샵: 스노우스케이트 입찰 공고, 팀이 맡은 스노우스케이트 강습
insert into jobs (id, shop_id, resort_id, sport_id, starts_at, ends_at, lesson_type, student_count, instructor_rate, status, assign_mode, bid_closes_at) values
  ('e0000000-0000-0000-0000-000000170001', 'b0000000-0000-0000-0000-000000000001', (select id from resorts where name = '하이원'), pg_temp.sport('스노우스케이트'),
   '2027-01-09 10:00+09', '2027-01-09 12:00+09', 'private', 1, 80000, 'draft', 'direct', null),
  ('e0000000-0000-0000-0000-000000170002', 'b0000000-0000-0000-0000-000000000002', (select id from resorts where name = '용평'), pg_temp.sport('스노우스케이트'),
   '2027-01-10 10:00+09', '2027-01-10 12:00+09', 'group', 3, 150000, 'open', 'bid', now() + interval '3 days'),
  ('e0000000-0000-0000-0000-000000170003', 'b0000000-0000-0000-0000-000000000002', (select id from resorts where name = '용평'), pg_temp.sport('스노우스케이트'),
   '2027-01-11 10:00+09', '2027-01-11 12:00+09', 'group', 3, 150000, 'assigned', 'bid', null);
insert into shop_instructors (shop_id, instructor_id) values ('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000023');
select set_config('app.system_write', 'on', true);
insert into assignments (job_id, instructor_id, via_shop_id, final_rate) values
  ('e0000000-0000-0000-0000-000000170003', null, 'b0000000-0000-0000-0000-000000000003', 150000);
select set_config('app.system_write', 'off', true);

-- 직접 의뢰
select pg_temp.login('a0000000-0000-0000-0000-000000000011');
select throws_ok($$select send_job_offer('e0000000-0000-0000-0000-000000170001', 'c0000000-0000-0000-0000-000000000021')$$,
  '22023', '이 종목을 하지 않는 강사입니다', '스키 강사에게 스노우스케이트 의뢰는 막힌다');
reset role;
insert into instructor_sports (instructor_id, sport_id) values ('c0000000-0000-0000-0000-000000000021', pg_temp.sport('스노우스케이트'));
select pg_temp.login('a0000000-0000-0000-0000-000000000011');
select lives_ok($$select send_job_offer('e0000000-0000-0000-0000-000000170001', 'c0000000-0000-0000-0000-000000000021')$$, '종목을 추가하면 의뢰할 수 있다');

-- 복수 종목 강사는 종목마다 검색된다
select ok(exists (select 1 from search_instructors('b0000000-0000-0000-0000-000000000001', (select id from resorts where name = '하이원'), pg_temp.sport('스키')) where instructor_id = 'c0000000-0000-0000-0000-000000000021'), '스키 검색에 김스키');
select ok(exists (select 1 from search_instructors('b0000000-0000-0000-0000-000000000001', (select id from resorts where name = '하이원'), pg_temp.sport('스노우스케이트')) where instructor_id = 'c0000000-0000-0000-0000-000000000021'), '스노우스케이트 검색에도 김스키');
select ok(not exists (select 1 from search_instructors('b0000000-0000-0000-0000-000000000001', (select id from resorts where name = '하이원'), pg_temp.sport('스노우보드')) where instructor_id = 'c0000000-0000-0000-0000-000000000021'), '스노우보드 검색에는 없다');

-- 입찰
select pg_temp.login('a0000000-0000-0000-0000-000000000022');
select throws_ok($$select place_bid('e0000000-0000-0000-0000-000000170002', 120000, null)$$,
  '22023', '이 종목을 하지 않는 강사입니다', '스노우보드 강사는 스노우스케이트 공고에 입찰할 수 없다');
select pg_temp.login('a0000000-0000-0000-0000-000000000021');
select lives_ok($$select place_bid('e0000000-0000-0000-0000-000000170002', 120000, null)$$, '스노우스케이트 강사는 입찰할 수 있다');

-- 팀원 지정
select pg_temp.login('a0000000-0000-0000-0000-000000000013');
select throws_ok($$select assign_team_instructor('e0000000-0000-0000-0000-000000170003', 'c0000000-0000-0000-0000-000000000023')$$,
  '22023', '이 종목을 하지 않는 강사입니다', '스키 팀원을 스노우스케이트 강습에 지정할 수 없다');
reset role;
insert into instructor_sports (instructor_id, sport_id) values ('c0000000-0000-0000-0000-000000000023', pg_temp.sport('스노우스케이트'));
select pg_temp.login('a0000000-0000-0000-0000-000000000013');
select lives_ok($$select assign_team_instructor('e0000000-0000-0000-0000-000000170003', 'c0000000-0000-0000-0000-000000000023')$$, '종목이 맞으면 지정된다');

-- 종목이 비어 있는 예전 강습은 막지 않는다
reset role;
update jobs set sport_id = null, status = 'draft' where id = 'e0000000-0000-0000-0000-000000170001';
update job_offers set status = 'expired' where job_id = 'e0000000-0000-0000-0000-000000170001';
select pg_temp.login('a0000000-0000-0000-0000-000000000011');
select lives_ok($$select send_job_offer('e0000000-0000-0000-0000-000000170001', 'c0000000-0000-0000-0000-000000000022')$$, '종목 없는 강습은 그대로');

select * from finish();
rollback;
