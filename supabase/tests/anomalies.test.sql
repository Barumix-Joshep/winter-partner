-- P14-10 규칙 기반 이상 패턴 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- 이보드: 최근 7일 일방 취소 2회
insert into instructor_penalties (instructor_id, reason, points) values
  ('c0000000-0000-0000-0000-000000000022', '부상', 1), ('c0000000-0000-0000-0000-000000000022', '개인 사정', 3);
-- 용평 알파인샵: 입찰 받고 선정 없이 내린 공고 3건
insert into jobs (id, shop_id, starts_at, ends_at, assign_mode, status, instructor_rate)
select ('91000000-0000-0000-0000-00000000000' || g)::uuid, 'b0000000-0000-0000-0000-000000000002', now() + interval '50 days', now() + interval '50 days 2 hours', 'bid', 'draft', 100000
from generate_series(1, 3) g;
insert into bids (job_id, instructor_id, amount, status)
select ('91000000-0000-0000-0000-00000000000' || g)::uuid, 'c0000000-0000-0000-0000-000000000022', 90000, 'rejected' from generate_series(1, 3) g;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count from admin_anomalies() where kind = 'repeat_cancel' and subject_name = '이보드'), 2, '7일 안 일방 취소 2회');
select is((select count from admin_anomalies() where kind = 'bids_dropped' and subject_name = '용평 알파인샵'), 3, '입찰 받고 선정 없이 내린 공고 3건');
select is((select (admin_instructor_activity('c0000000-0000-0000-0000-000000000022') ->> 'cancels_30d')::int), 2, '활동 요약 숫자');

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000011","role":"authenticated"}', true);
select throws_ok($$select * from admin_anomalies()$$, '42501', null, '샵 관리자는 못 본다');
select throws_ok($$select admin_instructor_activity('c0000000-0000-0000-0000-000000000022')$$, '42501', null, '샵 관리자는 활동 요약을 못 본다');

select * from finish();
rollback;
