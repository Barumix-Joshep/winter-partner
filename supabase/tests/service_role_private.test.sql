-- service_role로 손님 행을 쓸 수 있어야 한다 (서버 작업·관리 스크립트) (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);
set local role service_role;
select lives_ok($$insert into customers (shop_id, name, birth_year, guardian_name, guardian_phone)
  values ('b0000000-0000-0000-0000-000000000001', '서버로 넣은 손님', 2018, '보호자', '010-0000-0099')$$, 'service_role로 손님 추가 (보호자 확인 트리거 통과)');
select throws_ok($$insert into customers (shop_id, name, birth_year) values ('b0000000-0000-0000-0000-000000000001', '보호자 없음', 2018)$$, '22023', null, '트리거 규칙은 그대로');
select throws_ok($$select private.grant_platform_admin('x@y')$$, '42501', null, '관리자 지정 함수는 여전히 못 부른다');
select * from finish();
rollback;
