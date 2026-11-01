-- P5-4 취소 규칙 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000eea1', 'cn-a@t', '{"role":"instructor","name":"취소A"}'),
  ('00000000-0000-0000-0000-00000000eeb1', 'cn-b@t', '{"role":"instructor","name":"취소B"}'),
  ('00000000-0000-0000-0000-00000000eef1', 'cn-s@t', '{"role":"shop_admin","name":"취소샵"}');
insert into shops (id, name, status) values ('10000000-0000-0000-0000-00000000eef1', '취소샵', 'approved');
insert into shop_members (shop_id, user_id, is_owner) values ('10000000-0000-0000-0000-00000000eef1', '00000000-0000-0000-0000-00000000eef1', true);
create function pg_temp.iid(u text) returns uuid language sql as $$ select id from instructors where user_id = u::uuid $$;
insert into jobs (id, shop_id, starts_at, ends_at, assign_mode, status) values
  ('40000000-0000-0000-0000-00000000ee01', '10000000-0000-0000-0000-00000000eef1', now() + interval '5 days', now() + interval '5 days 2 hours', 'direct', 'assigned'),
  ('40000000-0000-0000-0000-00000000ee02', '10000000-0000-0000-0000-00000000eef1', now() + interval '5 hours', now() + interval '7 hours', 'direct', 'assigned'),
  ('40000000-0000-0000-0000-00000000ee03', '10000000-0000-0000-0000-00000000eef1', now() + interval '8 days', now() + interval '8 days 2 hours', 'direct', 'assigned'),
  ('40000000-0000-0000-0000-00000000ee04', '10000000-0000-0000-0000-00000000eef1', now() - interval '1 day', now() - interval '22 hours', 'direct', 'done'),
  ('40000000-0000-0000-0000-00000000ee05', '10000000-0000-0000-0000-00000000eef1', now() + interval '9 days', now() + interval '9 days 2 hours', 'bid', 'open');
insert into assignments (job_id, instructor_id, final_rate) values
  ('40000000-0000-0000-0000-00000000ee01', pg_temp.iid('00000000-0000-0000-0000-00000000eea1'), 80000),
  ('40000000-0000-0000-0000-00000000ee02', pg_temp.iid('00000000-0000-0000-0000-00000000eea1'), 80000),
  ('40000000-0000-0000-0000-00000000ee03', pg_temp.iid('00000000-0000-0000-0000-00000000eea1'), 80000),
  ('40000000-0000-0000-0000-00000000ee04', pg_temp.iid('00000000-0000-0000-0000-00000000eea1'), 80000);
insert into bids (job_id, instructor_id, amount) values ('40000000-0000-0000-0000-00000000ee05', pg_temp.iid('00000000-0000-0000-0000-00000000eeb1'), 90000);

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- 손님 취소 (샵이 기록)
select pg_temp.login('00000000-0000-0000-0000-00000000eef1');
select lives_ok($$select cancel_job('40000000-0000-0000-0000-00000000ee01', 'customer', '아이 감기')$$, '손님 취소');
select is((select status::text || '/' || canceled_by from jobs where id = '40000000-0000-0000-0000-00000000ee01'), 'canceled/customer', '강습 취소, 취소 주체 기록');
select throws_ok($$select cancel_job('40000000-0000-0000-0000-00000000ee04', 'customer', null)$$, '22023', null, '완료 보고된 강습은 취소할 수 없다');
select throws_ok($$select cancel_job('40000000-0000-0000-0000-00000000ee03', 'instructor', null)$$, '22023', null, '샵은 강사 취소로 기록할 수 없다');
select lives_ok($$select cancel_job('40000000-0000-0000-0000-00000000ee05', 'shop', '인원 부족')$$, '공고 중 강습도 샵 사정으로 취소');
select is((select status::text from bids where job_id = '40000000-0000-0000-0000-00000000ee05'), 'rejected', '입찰은 탈락 처리');

-- 강사
select pg_temp.login('00000000-0000-0000-0000-00000000eea1');
select ok(exists(select 1 from notifications where kind = 'job_canceled' and payload ->> 'job_id' = '40000000-0000-0000-0000-00000000ee01'), '강사에게 즉시 알림');
select throws_ok($$select cancel_job('40000000-0000-0000-0000-00000000ee03', 'customer', null)$$, '42501', null, '강사는 손님 취소를 기록할 수 없다');
select lives_ok($$select instructor_cancel('40000000-0000-0000-0000-00000000ee03', '부상')$$, '강사 일방 취소 (5일 전)');
-- 취소한 강사는 그 강습과 더 엮이지 않아 보이지 않는다. 결과는 관리 권한으로 확인
select set_config('role', 'postgres', true);
select is((select status::text from jobs where id = '40000000-0000-0000-0000-00000000ee03'), 'draft', '강습은 임시 저장으로 돌아가 샵이 다시 배정한다');
select ok(not exists(select 1 from assignments where job_id = '40000000-0000-0000-0000-00000000ee03'), '배정이 빠져 정산에서 제외');
select pg_temp.login('00000000-0000-0000-0000-00000000eea1');
select is((select points from instructor_penalties where job_id = '40000000-0000-0000-0000-00000000ee03'), 1, '여유 있게 취소하면 1점');
select lives_ok($$select instructor_cancel('40000000-0000-0000-0000-00000000ee02', '개인 사정')$$, '강사 일방 취소 (5시간 전)');
select is((select points from instructor_penalties where job_id = '40000000-0000-0000-0000-00000000ee02'), 3, '24시간 안에 취소하면 3점');
select is((select penalty_points from instructors where user_id = auth.uid()), 4, '강사 패널티 점수 누적');
select throws_ok($$select instructor_cancel('40000000-0000-0000-0000-00000000ee04', null)$$, '22023', null, '완료 보고 뒤에는 취소할 수 없다');

select * from finish();
rollback;
