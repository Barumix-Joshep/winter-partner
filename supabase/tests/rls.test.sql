-- P1-2 RLS 정책 테스트 (pgTAP). 실행: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- 테스트용 로그인 전환 ----------------------------------------------------
create function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- 픽스처 (postgres 권한) --------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@t'),
  ('00000000-0000-0000-0000-0000000000a1', 'shopa@t'),
  ('00000000-0000-0000-0000-0000000000b1', 'shopb@t'),
  ('00000000-0000-0000-0000-0000000000c1', 'team@t'),
  ('00000000-0000-0000-0000-0000000000f1', 'free@t'),
  ('00000000-0000-0000-0000-0000000000e1', 'excl@t');

insert into profiles (id, role, name) values
  ('00000000-0000-0000-0000-00000000000a', 'platform_admin', '본사'),
  ('00000000-0000-0000-0000-0000000000a1', 'shop_admin', 'A샵'),
  ('00000000-0000-0000-0000-0000000000b1', 'shop_admin', 'B샵'),
  ('00000000-0000-0000-0000-0000000000c1', 'shop_admin', '팀장'),
  ('00000000-0000-0000-0000-0000000000f1', 'instructor', '프리'),
  ('00000000-0000-0000-0000-0000000000e1', 'instructor', '전속');

insert into shops (id, type, name, status) values
  ('10000000-0000-0000-0000-00000000000a', 'rental_shop', 'A샵', 'approved'),
  ('10000000-0000-0000-0000-00000000000b', 'rental_shop', 'B샵', 'approved'),
  ('10000000-0000-0000-0000-00000000000c', 'lesson_team', '팀', 'approved');
insert into shop_members (shop_id, user_id, is_owner) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', true),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', true),
  ('10000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000c1', true);

insert into instructors (id, user_id) values
  ('20000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1'),
  ('20000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1');
insert into shop_instructors (shop_id, instructor_id) values
  ('10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-0000000000e1');
insert into instructor_certs (instructor_id, issuer, status) values
  ('20000000-0000-0000-0000-0000000000f1', 'KSIA-approved', 'approved'),
  ('20000000-0000-0000-0000-0000000000f1', 'KSIA-pending', 'pending');

insert into customers (id, shop_id, name, phone) values
  ('30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', '손님A', '010-1111-1111');

insert into jobs (id, shop_id, starts_at, ends_at, assign_mode, allow_team_bids, status) values
  ('40000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-00000000000a', '2026-12-20 10:00+09', '2026-12-20 12:00+09', 'bid', true, 'open'),
  ('40000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-00000000000a', '2026-12-21 10:00+09', '2026-12-21 12:00+09', 'direct', false, 'draft');
insert into job_prices (job_id, customer_price) values ('40000000-0000-0000-0000-0000000000a1', 150000);
insert into assignments (id, job_id, instructor_id, final_rate) values
  ('50000000-0000-0000-0000-0000000000a2', '40000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000f1', 80000);

-- 기준 정보 ---------------------------------------------------------------
set local role anon;
select ok((select count(*) from resorts) = 13, 'anon은 스키장 목록을 본다');
select is((select count(*) from shops), 0::bigint, 'anon은 샵을 못 본다');
select pg_temp.logout();

-- 샵 격리 -----------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select is((select count(*) from jobs where shop_id = '10000000-0000-0000-0000-00000000000a'), 0::bigint, 'B샵은 A샵 강습을 못 본다 (입찰 공고 포함)');
select is((select count(*) from customers), 0::bigint, 'B샵은 A샵 손님을 못 본다');
select throws_ok(
  $$insert into customers (shop_id, name) values ('10000000-0000-0000-0000-00000000000a', '침투')$$,
  '42501', null, 'B샵은 A샵에 손님을 넣지 못한다');
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select is((select count(*) from jobs), 2::bigint, 'A샵은 자기 강습을 모두 본다');
select is((select count(*) from customers), 1::bigint, 'A샵은 자기 손님을 본다');
select is((select customer_price from job_prices), 150000, 'A샵은 손님 강습료를 본다');
select pg_temp.logout();

-- 손님 정보 ---------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select is((select count(*) from customers), 0::bigint, '플랫폼 관리자도 손님 연락처를 못 본다');
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select is((select count(*) from customers), 0::bigint, '강사는 손님 테이블을 못 본다');
select is((select count(*) from job_prices), 0::bigint, '강사는 손님 강습료를 못 본다');

-- 입찰 공고: 프리랜서 ------------------------------------------------------
select is((select count(*) from jobs where id = '40000000-0000-0000-0000-0000000000a1'), 1::bigint, '프리랜서는 공개 입찰 공고를 본다');
select is((select count(*) from jobs where id = '40000000-0000-0000-0000-0000000000a2'), 1::bigint, '강사는 자기가 배정된 강습을 본다');
select lives_ok(
  $$insert into bids (job_id, instructor_id, amount) values ('40000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000f1', 90000)$$,
  '프리랜서는 입찰할 수 있다');
select throws_ok(
  $$update assignments set final_rate = 999999 where id = '50000000-0000-0000-0000-0000000000a2'$$,
  '42501', null, '강사는 배정 금액을 바꾸지 못한다');
select lives_ok(
  $$update assignments set lesson_note = '턴 연습 필요' where id = '50000000-0000-0000-0000-0000000000a2'$$,
  '강사는 강습 노트를 쓴다');
select throws_ok(
  $$update profiles set role = 'platform_admin' where id = auth.uid()$$,
  '42501', null, '강사는 자기 역할을 올리지 못한다');
select pg_temp.logout();

-- 입찰 공고: 전속 강사 -----------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select is((select count(*) from jobs), 0::bigint, '전속 강사는 입찰 공고를 못 본다');
select throws_ok(
  $$insert into bids (job_id, instructor_id, amount) values ('40000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000e1', 90000)$$,
  '42501', null, '전속 강사는 입찰하지 못한다');
-- 자격증: 검증된 것만 공개
select is((select count(*) from instructor_certs), 1::bigint, '다른 강사의 자격증은 검증된 것만 보인다');
select pg_temp.logout();

-- 팀 입찰 -----------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select is((select count(*) from jobs where id = '40000000-0000-0000-0000-0000000000a1'), 1::bigint, '강습팀은 팀 입찰 허용 공고를 본다');
select pg_temp.logout();

-- 샵 생성 -----------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select lives_ok(
  $$insert into shops (id, name) values ('10000000-0000-0000-0000-0000000000dd', '새샵')$$,
  '샵 관리자는 샵을 만든다');
select ok(exists(select 1 from shop_members where shop_id = '10000000-0000-0000-0000-0000000000dd' and user_id = auth.uid() and is_owner),
  '만든 사람이 owner가 된다');
select throws_ok(
  $$update shops set status = 'approved' where id = '10000000-0000-0000-0000-0000000000dd'$$,
  '42501', null, '샵은 스스로 승인하지 못한다');
select pg_temp.logout();

select * from finish();
rollback;
