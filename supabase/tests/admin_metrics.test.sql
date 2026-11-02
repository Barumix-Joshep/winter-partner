-- P14-11 관리자 집계 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select sum(value)::int from admin_metric('jobs_by_shop', '2026-12-01')), 3, '12월 샵별 강습 수 (시드 3건)');
select is((select value::int from admin_metric('active_shops', '2026-12-01')), 2, '강습이 있었던 샵');
select throws_ok($$select * from admin_metric('drop table x', null)$$, '22023', null, '정의된 집계만');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000011","role":"authenticated"}', true);
select throws_ok($$select * from admin_metric('jobs_by_shop', null)$$, '42501', null, '본사만');

select * from finish();
rollback;
