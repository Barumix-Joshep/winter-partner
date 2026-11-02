-- P16-4 시범 샵 온보딩: 체크리스트 상태·닫기, 강사 CSV 매칭 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000077701', 'ob-shop@t', '{"role":"shop_admin","name":"새샵"}'),
  ('00000000-0000-0000-0000-000000077702', 'ob-other@t', '{"role":"shop_admin","name":"옆샵"}'),
  ('00000000-0000-0000-0000-000000077711', 'ob-free@t', '{"role":"instructor","name":"프리강사"}'),
  ('00000000-0000-0000-0000-000000077712', 'ob-excl@t', '{"role":"instructor","name":"남의전속"}');
update profiles set phone = '010-7777-0011' where id = '00000000-0000-0000-0000-000000077711';
delete from instructors where user_id in ('00000000-0000-0000-0000-000000077711', '00000000-0000-0000-0000-000000077712');
insert into instructors (id, user_id) values
  ('c0000000-0000-0000-0000-000000077711', '00000000-0000-0000-0000-000000077711'),
  ('c0000000-0000-0000-0000-000000077712', '00000000-0000-0000-0000-000000077712');
insert into shops (id, name, status, created_by) values
  ('10000000-0000-0000-0000-000000077701', '새샵', 'approved', '00000000-0000-0000-0000-000000077701'),
  ('10000000-0000-0000-0000-000000077702', '옆샵', 'approved', '00000000-0000-0000-0000-000000077702');
insert into shop_members (shop_id, user_id, is_owner) values
  ('10000000-0000-0000-0000-000000077701', '00000000-0000-0000-0000-000000077701', true),
  ('10000000-0000-0000-0000-000000077702', '00000000-0000-0000-0000-000000077702', true);
insert into shop_instructors (shop_id, instructor_id) values ('10000000-0000-0000-0000-000000077702', 'c0000000-0000-0000-0000-000000077712');

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

select pg_temp.login('00000000-0000-0000-0000-000000077701');

-- 처음: 아무것도 안 한 상태
select is(shop_onboarding('10000000-0000-0000-0000-000000077701'),
  '{"info":false,"resorts":false,"instructors":false,"first_job":false,"push":false,"hidden":false,"approved":true}'::jsonb, '처음에는 모두 미완료');

-- 하나씩 하면 자동으로 체크된다
update shops set business_no = '000-00-77701', owner_name = '새샵사장' where id = '10000000-0000-0000-0000-000000077701';
select is((shop_onboarding('10000000-0000-0000-0000-000000077701') ->> 'info')::boolean, true, '샵 정보');
insert into shop_resorts (shop_id, resort_id) values ('10000000-0000-0000-0000-000000077701', 1);
select is((shop_onboarding('10000000-0000-0000-0000-000000077701') ->> 'resorts')::boolean, true, '영업 스키장');
insert into exclusive_invites (shop_id, instructor_id) values ('10000000-0000-0000-0000-000000077701', 'c0000000-0000-0000-0000-000000077711');
select is((shop_onboarding('10000000-0000-0000-0000-000000077701') ->> 'instructors')::boolean, true, '전속 초대를 보내면 강사 등록 완료');
insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ('00000000-0000-0000-0000-000000077701', 'https://push.example/ob', 'k', 'a');
select is((shop_onboarding('10000000-0000-0000-0000-000000077701') ->> 'push')::boolean, true, '알림 켜기 (내 기기)');

-- 닫기·다시 열기
select lives_ok($$select set_onboarding_hidden('10000000-0000-0000-0000-000000077701', true)$$, '닫기');
select is((shop_onboarding('10000000-0000-0000-0000-000000077701') ->> 'hidden')::boolean, true, '닫힘 상태');
select set_onboarding_hidden('10000000-0000-0000-0000-000000077701', false);
select is((shop_onboarding('10000000-0000-0000-0000-000000077701') ->> 'hidden')::boolean, false, '다시 열기');

-- 다른 샵은 볼 수도 바꿀 수도 없다
select throws_ok($$select shop_onboarding('10000000-0000-0000-0000-000000077702')$$, '42501', null, '남의 샵 상태 조회 불가');
select throws_ok($$select set_onboarding_hidden('10000000-0000-0000-0000-000000077702', true)$$, '42501', null, '남의 샵 닫기 불가');

-- 강사 CSV 매칭: 이메일 또는 휴대폰이 맞는 강사만, 상태와 함께
select is(
  (select array_agg(state order by idx) from import_match_instructors('10000000-0000-0000-0000-000000077701',
     array['', 'OB-EXCL@t', 'nobody@t', ''], array['01077770011', '', '', '010-9999-9999'])),
  array['invited', 'other_exclusive', null, null]::text[],
  '휴대폰으로 찾고(초대 보냄), 이메일 대소문자 무시(남의 전속), 없는 사람은 비움');
select is(
  (select name from import_match_instructors('10000000-0000-0000-0000-000000077701', array[''], array['010-7777-0011'])),
  '프리강사', '이름을 돌려준다');
select is(
  (select instructor_id from import_match_instructors('10000000-0000-0000-0000-000000077701', array['ob-excl@t'], array[''])),
  null::uuid, '남의 전속 강사는 id를 주지 않는다');
select throws_ok($$select * from import_match_instructors('10000000-0000-0000-0000-000000077702', array['x@t'], array[''])$$, '42501', null, '남의 샵으로 매칭 불가');
select throws_ok($$select * from import_match_instructors('10000000-0000-0000-0000-000000077701', array_fill(''::text, array[301]), array_fill(''::text, array[301]))$$, '22023', null, '한 번에 300명까지');

-- 첫 강습
select pg_temp.login('00000000-0000-0000-0000-000000077701');
reset role;
insert into jobs (shop_id, sport_id, resort_id, starts_at, ends_at, assign_mode)
values ('10000000-0000-0000-0000-000000077701', 1, 1, now() + interval '1 day', now() + interval '1 day 2 hours', 'direct');
select pg_temp.login('00000000-0000-0000-0000-000000077701');
select is((shop_onboarding('10000000-0000-0000-0000-000000077701') ->> 'first_job')::boolean, true, '첫 강습 등록');

select * from finish();
rollback;
