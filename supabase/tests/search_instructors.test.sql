-- P3-3 샵용 강사 찾기 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000005a1', 'sa@t', '{"role":"instructor","name":"프리A"}'),
  ('00000000-0000-0000-0000-0000000005b1', 'sb@t', '{"role":"instructor","name":"전속B"}'),
  ('00000000-0000-0000-0000-0000000005c1', 'sc@t', '{"role":"instructor","name":"남의전속C"}'),
  ('00000000-0000-0000-0000-0000000005d1', 'sd@t', '{"role":"instructor","name":"용평D"}'),
  ('00000000-0000-0000-0000-0000000005e1', 'se@t', '{"role":"instructor","name":"바쁜E"}'),
  ('00000000-0000-0000-0000-0000000005f1', 'sf@t', '{"role":"shop_admin","name":"검색샵"}'),
  ('00000000-0000-0000-0000-0000000005f2', 'sg@t', '{"role":"shop_admin","name":"다른샵"}');

insert into shops (id, name, status) values
  ('10000000-0000-0000-0000-0000000005f1', '검색샵', 'approved'),
  ('10000000-0000-0000-0000-0000000005f2', '다른샵', 'approved');
insert into shop_members (shop_id, user_id, is_owner) values
  ('10000000-0000-0000-0000-0000000005f1', '00000000-0000-0000-0000-0000000005f1', true),
  ('10000000-0000-0000-0000-0000000005f2', '00000000-0000-0000-0000-0000000005f2', true);
-- 시드 데이터와 겹치지 않는 스키장(12 에덴밸리, 11 무주)을 쓴다
insert into shop_resorts values ('10000000-0000-0000-0000-0000000005f1', 12), ('10000000-0000-0000-0000-0000000005f2', 12);

-- 강사 id: 이름으로 찾기
create function pg_temp.iid(n text) returns uuid language sql as $$
  select i.id from instructors i join profiles p on p.id = i.user_id where p.name = n
$$;

update instructors set base_rate = 80000 where id in (pg_temp.iid('프리A'), pg_temp.iid('전속B'), pg_temp.iid('바쁜E'));
insert into instructor_sports select pg_temp.iid(n), 1 from unnest(array['프리A','전속B','남의전속C','용평D','바쁜E']) n;
insert into instructor_resorts select pg_temp.iid(n), 12 from unnest(array['프리A','전속B','남의전속C','바쁜E']) n;
insert into instructor_resorts values (pg_temp.iid('용평D'), 11);
insert into shop_instructors (shop_id, instructor_id) values
  ('10000000-0000-0000-0000-0000000005f1', pg_temp.iid('전속B')),
  ('10000000-0000-0000-0000-0000000005f2', pg_temp.iid('남의전속C'));
insert into instructor_certs (instructor_id, issuer, grade, status) values
  (pg_temp.iid('프리A'), 'KSIA', 'Level 2', 'approved'),
  (pg_temp.iid('프리A'), 'KSIA', 'Level 3', 'pending');
insert into availability (instructor_id, starts_at, ends_at) values
  (pg_temp.iid('프리A'), '2026-12-20 09:00+09', '2026-12-20 17:00+09'),
  (pg_temp.iid('바쁜E'), '2026-12-20 09:00+09', '2026-12-20 17:00+09');
-- 바쁜E는 다른 샵 강습이 오전에 잡혀 있다
insert into jobs (id, shop_id, starts_at, ends_at, status) values
  ('40000000-0000-0000-0000-0000000005e1', '10000000-0000-0000-0000-0000000005f2', '2026-12-20 10:00+09', '2026-12-20 12:00+09', 'assigned');
insert into assignments (job_id, instructor_id, final_rate) values ('40000000-0000-0000-0000-0000000005e1', pg_temp.iid('바쁜E'), 80000);

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000005f1","role":"authenticated"}', true);

select is(
  (select array_agg(name order by name) from search_instructors('10000000-0000-0000-0000-0000000005f1', 12, null, null, null)),
  array['바쁜E', '전속B', '프리A'],
  '영업 스키장 강사 중 다른 샵 전속은 빼고 보인다');
select is(
  (select name from search_instructors('10000000-0000-0000-0000-0000000005f1', 12, null, null, null) limit 1),
  '전속B', '우리 전속 강사가 먼저');
select is(
  (select is_mine from search_instructors('10000000-0000-0000-0000-0000000005f1', 12, null, null, null) where name = '전속B'),
  true, '전속 여부 표시');
select is(
  (select certs from search_instructors('10000000-0000-0000-0000-0000000005f1', 12, null, null, null) where name = '프리A'),
  array['KSIA Level 2'], '검증된 자격증만');
select is(
  (select array_agg(name) from search_instructors('10000000-0000-0000-0000-0000000005f1', 12, null, '2026-12-20 09:00+09', '2026-12-20 12:00+09')),
  array['프리A'], '시간대를 주면 가능 일정이 있고 다른 강습과 겹치지 않는 강사만');
select is(
  (select count(*) from search_instructors('10000000-0000-0000-0000-0000000005f1', 12, 2, null, null)),
  0::bigint, '종목 필터');
select throws_ok(
  $$select * from search_instructors('10000000-0000-0000-0000-0000000005f1', 11, null, null, null)$$,
  '22023', null, '영업 스키장이 아닌 곳은 검색할 수 없다');
select throws_ok(
  $$select * from search_instructors('10000000-0000-0000-0000-0000000005f2', 12, null, null, null)$$,
  '42501', null, '다른 샵 이름으로는 검색할 수 없다');
select ok(
  not exists (select 1 from information_schema.parameters
              where specific_name like 'search_instructors%' and parameter_mode = 'OUT' and parameter_name ~ 'phone|email'),
  '연락처는 결과에 없다');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000005a1","role":"authenticated"}', true);
select throws_ok(
  $$select * from search_instructors('10000000-0000-0000-0000-0000000005f1', 12, null, null, null)$$,
  '42501', null, '강사는 강사 찾기를 쓸 수 없다');

select * from finish();
rollback;
