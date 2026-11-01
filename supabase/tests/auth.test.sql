-- P2-1 가입 시 프로필 자동 생성 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000001a1', 'new-shop@t', '{"role":"shop_admin","name":"새 샵"}'),
  ('00000000-0000-0000-0000-0000000001a2', 'new-inst@t', '{"role":"instructor","name":"  새 강사 "}'),
  ('00000000-0000-0000-0000-0000000001a3', 'hacker@t',   '{"role":"platform_admin","name":"해커"}'),
  ('00000000-0000-0000-0000-0000000001a4', 'kakao@t',    '{}');

select is((select role::text from profiles where id = '00000000-0000-0000-0000-0000000001a1'), 'shop_admin', '샵 관리자 가입은 프로필을 만든다');
select is((select name from profiles where id = '00000000-0000-0000-0000-0000000001a2'), '새 강사', '이름 앞뒤 공백을 다듬는다');
select ok(exists(select 1 from instructors where user_id = '00000000-0000-0000-0000-0000000001a2'), '강사 가입은 강사 프로필도 만든다');
select ok(not exists(select 1 from profiles where id = '00000000-0000-0000-0000-0000000001a3'), '플랫폼 관리자 역할로는 프로필이 생기지 않는다');
select ok(not exists(select 1 from profiles where id = '00000000-0000-0000-0000-0000000001a4'), '역할이 없으면(카카오 등) 프로필을 나중에 만든다');

select * from finish();
rollback;
