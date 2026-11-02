-- P18-3 공격자 관점 권한 점검 (pgTAP)
-- A1 팀원은 팀 확정 금액을 못 읽는다 / A2 샵이 남을 전속으로 바꿀 수 없다 / A3 입찰을 직접 고칠 수 없다
-- A4 승인된 자격증을 직접 고칠 수 없다 / A5 승인 전 샵은 강사 찾기·대조·의뢰를 못 한다
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- 팀(평창 라이딩스쿨)이 맡은 용평 알파인샵 강습, 팀원은 박스키, 팀 확정 금액 185000
insert into shop_instructors (shop_id, instructor_id) values ('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000023');
insert into jobs (id, shop_id, resort_id, starts_at, ends_at, lesson_type, student_count, instructor_rate, status, assign_mode) values
  ('e0000000-0000-0000-0000-000000018301', 'b0000000-0000-0000-0000-000000000002', (select id from resorts where name = '용평'),
   '2027-01-20 10:00+09', '2027-01-20 12:00+09', 'group', 3, 200000, 'assigned', 'bid');
select set_config('app.system_write', 'on', true);
insert into assignments (job_id, instructor_id, via_shop_id, final_rate) values
  ('e0000000-0000-0000-0000-000000018301', 'c0000000-0000-0000-0000-000000000023', 'b0000000-0000-0000-0000-000000000003', 185000);
select set_config('app.system_write', 'off', true);

-- A1
select pg_temp.login('a0000000-0000-0000-0000-000000000023'); -- 박스키(팀원)
select is((select count(*) from assignments where job_id = 'e0000000-0000-0000-0000-000000018301'), 0::bigint, '팀원은 팀 강습 배정 행(금액 포함)을 직접 못 읽는다');
select is((select final_rate from instructor_assignments where job_id = 'e0000000-0000-0000-0000-000000018301'), null::int, '강사 화면용 뷰에서는 팀 금액이 비어 있다');
select ok(exists (select 1 from instructor_assignments where job_id = 'e0000000-0000-0000-0000-000000018301'), '팀원도 자기 강습은 본다 (시간·장소용)');
select pg_temp.login('a0000000-0000-0000-0000-000000000013'); -- 팀장
select is((select final_rate from assignments where job_id = 'e0000000-0000-0000-0000-000000018301'), 185000, '팀은 확정 금액을 본다');
select pg_temp.login('a0000000-0000-0000-0000-000000000012'); -- 공고 샵
select is((select final_rate from assignments where job_id = 'e0000000-0000-0000-0000-000000018301'), 185000, '공고 샵은 본다');
select pg_temp.login('a0000000-0000-0000-0000-000000000021'); -- 김스키 (자기 직접 배정)
select is((select final_rate from instructor_assignments where job_id = 'e0000000-0000-0000-0000-000000000001'), 80000, '프리랜서는 자기 직접 배정 금액을 본다');
select is((select count(*) from instructor_assignments where job_id = 'e0000000-0000-0000-0000-000000018301'), 0::bigint, '남의 배정은 뷰에도 없다');

-- A2: 하이원 스노우렌탈이 전속 행의 강사를 김스키로 바꾸려 한다
select pg_temp.login('a0000000-0000-0000-0000-000000000011');
update shop_instructors set instructor_id = 'c0000000-0000-0000-0000-000000000021' where shop_id = 'b0000000-0000-0000-0000-000000000001';
reset role;
select is((select count(*) from shop_instructors where instructor_id = 'c0000000-0000-0000-0000-000000000021'), 0::bigint, '샵이 동의 없이 남을 전속으로 바꿀 수 없다');

-- A3: 이보드가 자기 입찰을 직접 상한 위로 올리고, 철회한 입찰을 되살리려 한다
select pg_temp.login('a0000000-0000-0000-0000-000000000022');
update bids set amount = 999999 where instructor_id = 'c0000000-0000-0000-0000-000000000022';
reset role;
select is((select max(amount) from bids where instructor_id = 'c0000000-0000-0000-0000-000000000022'), 180000, '입찰 금액은 직접 못 바꾼다 (place_bid로만)');
update bids set status = 'withdrawn' where instructor_id = 'c0000000-0000-0000-0000-000000000022';
select pg_temp.login('a0000000-0000-0000-0000-000000000022');
update bids set status = 'open' where instructor_id = 'c0000000-0000-0000-0000-000000000022';
reset role;
select is((select count(*) from bids where instructor_id = 'c0000000-0000-0000-0000-000000000022' and status = 'open'), 0::bigint, '철회한 입찰을 직접 되살릴 수 없다');

-- A4: 김스키가 승인된 자격증 등급을 직접 바꾸려 한다
select pg_temp.login('a0000000-0000-0000-0000-000000000021');
update instructor_certs set grade = 'Level 4' where instructor_id = 'c0000000-0000-0000-0000-000000000021';
reset role;
select is((select grade from instructor_certs where instructor_id = 'c0000000-0000-0000-0000-000000000021'), 'Level 2', '승인된 자격증은 직접 못 고친다');

-- A5: 승인 전 샵
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-000000018399', 'pending-shop@t', '{"role":"shop_admin","name":"대기샵"}');
insert into shops (id, type, name, status) values ('10000000-0000-0000-0000-000000018399', 'rental_shop', '대기샵', 'pending');
insert into shop_members (shop_id, user_id, is_owner) values ('10000000-0000-0000-0000-000000018399', '00000000-0000-0000-0000-000000018399', true);
insert into shop_resorts (shop_id, resort_id) select '10000000-0000-0000-0000-000000018399', id from resorts where name = '하이원';
insert into jobs (id, shop_id, resort_id, starts_at, ends_at, lesson_type, student_count, instructor_rate, status) values
  ('e0000000-0000-0000-0000-000000018399', '10000000-0000-0000-0000-000000018399', (select id from resorts where name = '하이원'),
   '2027-01-21 10:00+09', '2027-01-21 12:00+09', 'private', 1, 80000, 'draft');
select pg_temp.login('00000000-0000-0000-0000-000000018399');
select throws_ok($$select * from search_instructors('10000000-0000-0000-0000-000000018399', (select id from resorts where name = '하이원'))$$, '42501', '본사 승인 뒤에 쓸 수 있습니다', '승인 전에는 강사 찾기 불가');
select throws_ok($$select * from import_match_instructors('10000000-0000-0000-0000-000000018399', array['kim@winter.test'], array[''])$$, '42501', '본사 승인 뒤에 쓸 수 있습니다', '승인 전에는 이메일·휴대폰 대조 불가');
select throws_ok($$select send_job_offer('e0000000-0000-0000-0000-000000018399', 'c0000000-0000-0000-0000-000000000021')$$, '42501', '본사 승인 뒤에 쓸 수 있습니다', '승인 전에는 직접 의뢰 불가');
select throws_ok($$select publish_bid_job('e0000000-0000-0000-0000-000000018399', now() + interval '1 day', false)$$, '42501', '본사 승인 뒤에 쓸 수 있습니다', '승인 전에는 입찰 공고 불가');

select * from finish();
rollback;
