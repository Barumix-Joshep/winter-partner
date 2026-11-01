-- P12-1 첫 플랫폼 관리자 지정 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000ccc01', 'boss@t', now(), '{"role":"shop_admin","name":"관리자후보"}'),
  ('00000000-0000-0000-0000-0000000ccc02', 'unconfirmed@t', null, '{"role":"shop_admin","name":"미인증"}'),
  ('00000000-0000-0000-0000-0000000ccc03', 'teacher@t', now(), '{"role":"instructor","name":"강사계정"}');

select ok(not has_function_privilege('authenticated', 'private.grant_platform_admin(text)', 'execute'), 'authenticated는 실행 불가');
select ok(not has_function_privilege('anon', 'private.grant_platform_admin(text)', 'execute'), 'anon은 실행 불가');
select ok(not has_function_privilege('service_role', 'private.grant_platform_admin(text)', 'execute'), 'service_role(앱 서버)도 실행 불가');

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000ccc01","role":"authenticated"}', true);
select throws_ok($$select private.grant_platform_admin('boss@t')$$, '42501', null, '로그인 사용자가 스스로 부를 수 없다');
reset role;
select set_config('request.jwt.claims', '', true);  -- SQL Editor처럼 로그인 정보 없이

select throws_ok($$select private.grant_platform_admin('unconfirmed@t')$$, '22023', null, '이메일 인증 전 계정은 안 된다');
select throws_ok($$select private.grant_platform_admin('teacher@t')$$, '22023', null, '강사 계정은 바꾸지 않는다');
select lives_ok($$select private.grant_platform_admin(' BOSS@t ')$$, 'DB 관리자는 지정할 수 있다 (대소문자·공백 무시)');
select is((select role::text from profiles where id = '00000000-0000-0000-0000-0000000ccc01'), 'platform_admin', '역할이 바뀌었다');

select * from finish();
rollback;
