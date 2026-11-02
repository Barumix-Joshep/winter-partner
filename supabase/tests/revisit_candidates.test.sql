-- P14-9 재방문 후보 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

-- 손님 하나(shop1)는 강습 이력이 있다. 본인 광고 동의를 넣으면 후보가 된다.
update jobs set status = 'approved', starts_at = now() - interval '200 days', ends_at = now() - interval '200 days' + interval '2 hours'
where id = 'e0000000-0000-0000-0000-000000000001';
insert into job_customers (job_id, customer_id) values ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001');
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000011","role":"authenticated"}', true);
select is((select count(*)::int from revisit_candidates('b0000000-0000-0000-0000-000000000001')), 0, '광고 동의가 없으면 후보가 아니다 (손님 둘은 직원 기록뿐)');
reset role;
insert into customer_consents (shop_id, customer_id, kind, granted, subject, method, text_version)
values ('b0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'marketing', true, 'self', 'qr', 'v1');
select set_config('role', 'authenticated', true);
select is((select array_agg(name) from revisit_candidates('b0000000-0000-0000-0000-000000000001')), array['손님 하나'], '본인 동의 + 강습 이력이 있으면 후보');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000012","role":"authenticated"}', true);
select is((select count(*)::int from revisit_candidates('b0000000-0000-0000-0000-000000000001')), 0, '다른 샵은 아무것도 못 본다');

select * from finish();
rollback;
