-- P14-8 입찰 금액 참고 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- 시드 공고 e..003(용평·스노우보드·그룹)과 같은 조건의 낙찰 3건을 만든다
insert into jobs (id, shop_id, resort_id, sport_id, starts_at, ends_at, lesson_type, student_count, instructor_rate, assign_mode, status)
select ('90000000-0000-0000-0000-00000000000' || g)::uuid, 'b0000000-0000-0000-0000-000000000002', j.resort_id, j.sport_id,
       now() + make_interval(days => 40 + g), now() + make_interval(days => 40 + g, hours => 2), 'group', 4, 200000, 'bid', 'assigned'
from jobs j, generate_series(1, 3) g where j.id = 'e0000000-0000-0000-0000-000000000003';
insert into bids (job_id, instructor_id, amount, status)
select ('90000000-0000-0000-0000-00000000000' || g)::uuid, 'c0000000-0000-0000-0000-000000000022', 150000 + g * 10000, 'selected' from generate_series(1, 2) g;
insert into assignments (job_id, instructor_id, final_rate)
select ('90000000-0000-0000-0000-00000000000' || g)::uuid, null, 150000 + g * 10000 from generate_series(1, 2) g;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000022","role":"authenticated"}', true);
select is((select (samples, median) from bid_price_reference('e0000000-0000-0000-0000-000000000003')), (2, null::int), '2건이면 숫자를 주지 않는다');
reset role;
insert into bids (job_id, instructor_id, amount, status) values ('90000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000022', 190000, 'selected');
insert into assignments (job_id, final_rate) values ('90000000-0000-0000-0000-000000000003', 190000);
select set_config('role', 'authenticated', true);
select is((select (samples, median, low, high) from bid_price_reference('e0000000-0000-0000-0000-000000000003')), (3, 170000, 160000, 190000), '3건이면 중앙값·범위');

-- 전속 강사(오전속)는 입찰 공고를 볼 수 없으니 참고값도 못 본다
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000024","role":"authenticated"}', true);
select throws_ok($$select * from bid_price_reference('e0000000-0000-0000-0000-000000000003')$$, '42501', null, '전속 강사는 못 본다');
-- 공고 샵은 본다
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000012","role":"authenticated"}', true);
select is((select samples from bid_price_reference('e0000000-0000-0000-0000-000000000003')), 3, '공고 샵도 본다');

select * from finish();
rollback;
