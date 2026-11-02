-- P14-6 손님 요약 캐시 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select lives_ok($$select save_customer_summary('d0000000-0000-0000-0000-000000000001', '{"summary":["a"],"source_hash":"x"}')$$, '서버가 요약 저장');
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000011","role":"authenticated"}', true);
select throws_ok($$select save_customer_summary('d0000000-0000-0000-0000-000000000001', '{}')$$, '42501', null, '로그인 사용자는 저장 함수를 못 부른다');
select erase_customer('d0000000-0000-0000-0000-000000000001', '익명화');
reset role;
select is((select ai_summary from customers where id = 'd0000000-0000-0000-0000-000000000001'), null::jsonb, '익명화하면 요약도 지운다');

select * from finish();
rollback;
