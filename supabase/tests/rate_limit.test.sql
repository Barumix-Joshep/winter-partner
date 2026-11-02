-- P16-3 요청 횟수 제한: 세기(public_rate_limit)와 세지 않고 보기(public_rate_peek) (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select is(public_rate_peek('t:a', 2, 600), true, '기록이 없으면 통과');
select is(public_rate_limit('t:a', 2, 600), true, '1번째');
select is(public_rate_peek('t:a', 2, 600), true, '보기는 횟수를 늘리지 않는다 (1/2)');
select is(public_rate_limit('t:a', 2, 600), true, '2번째');
select is(public_rate_peek('t:a', 2, 600), false, '한도에 닿으면 막는다');
select is(public_rate_peek('t:b', 2, 600), true, '다른 키는 따로 센다');

select set_config('role', 'authenticated', true);
select throws_ok($$select public_rate_peek('t:a', 2, 600)$$, '42501', null, '로그인 사용자가 직접 부를 수 없다');

select * from finish();
rollback;
