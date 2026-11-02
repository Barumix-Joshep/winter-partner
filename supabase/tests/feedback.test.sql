-- P16-6 의견 보내기와 본사 상태 관리 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000088801', 'fb-shop@t', '{"role":"shop_admin","name":"의견샵"}'),
  ('00000000-0000-0000-0000-000000088802', 'fb-other@t', '{"role":"instructor","name":"다른사람"}'),
  ('00000000-0000-0000-0000-000000088809', 'fb-admin@t', '{}');
insert into profiles (id, role, name) values ('00000000-0000-0000-0000-000000088809', 'platform_admin', '본사')
  on conflict (id) do update set role = 'platform_admin';

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- 서버(service_role)가 기록한다. 로그인 사용자는 직접 쓸 수 없다
select lives_ok($$select submit_feedback('00000000-0000-0000-0000-000000088801', '/shop/jobs/new', '접수 문자 붙여넣기가 안 돼요', null)$$, '로그인 사용자 의견');
select lives_ok($$select submit_feedback(null, '/login', '가입 메일이 안 와요', 'kakao: abc')$$, '로그인 없이도 보낼 수 있다');
select throws_ok($$select submit_feedback(null, '/x', '   ', null)$$, '22023', null, '빈 내용은 막는다');
select ok((select length(body) <= 2000 and length(page_path) <= 300 from feedback order by id desc limit 1), '길이 제한');
select is((select role from feedback where page_path = '/shop/jobs/new'), 'shop_admin', '역할을 같이 남긴다');

select pg_temp.login('00000000-0000-0000-0000-000000088801');
select throws_ok($$select submit_feedback('00000000-0000-0000-0000-000000088801', '/x', 'y', null)$$, '42501', null, '직접 호출 불가');
select is((select count(*) from feedback), 0::bigint, '보낸 사람도 목록은 못 본다 (본사만)');

select pg_temp.login('00000000-0000-0000-0000-000000088809');
select is((select count(*) from feedback where body like '%붙여넣기%' or body like '%메일%'), 2::bigint, '본사는 본다');
select lives_ok($$select set_feedback_status((select id from feedback where page_path = '/login'), 'done', '메일 서비스 연결 예정')$$, '상태 바꾸기');
select pg_temp.login('00000000-0000-0000-0000-000000088802');
select throws_ok($$select set_feedback_status((select 1::bigint), 'done', null)$$, '42501', null, '본사만 상태를 바꾼다');

select * from finish();
rollback;
