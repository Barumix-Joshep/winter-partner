-- P3-1 강사 프로필 저장 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000003a1', 'prof-inst@t', '{"role":"instructor","name":"프로필강사"}'),
  ('00000000-0000-0000-0000-0000000003a2', 'prof-shop@t', '{"role":"shop_admin","name":"프로필샵"}');

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000003a1","role":"authenticated"}', true);

select lives_ok($$select save_instructor_profile('KSIA Level 1', '어린이 전문', 70000, array[1, 2], array[6, 7])$$, '강사는 자기 프로필을 저장한다');
select is((select bio from instructors where user_id = auth.uid()), '어린이 전문', '소개가 저장된다');
select is((select count(*) from instructor_sports s join instructors i on i.id = s.instructor_id where i.user_id = auth.uid()), 2::bigint, '종목 2개');

select lives_ok($$select save_instructor_profile('KSIA Level 1', '어린이 전문', 70000, array[2], array[8])$$, '다시 저장하면');
select is((select array_agg(resort_id) from instructor_resorts r join instructors i on i.id = r.instructor_id where i.user_id = auth.uid()), array[8], '스키장이 새 선택으로 바뀐다');
select throws_ok($$select save_instructor_profile(null, null, null, array[]::int[], array[1])$$, '22023', null, '종목은 하나 이상');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000003a2","role":"authenticated"}', true);
select throws_ok($$select save_instructor_profile(null, null, null, array[1], array[1])$$, '42501', null, '강사가 아니면 저장할 수 없다');

select * from finish();
rollback;
