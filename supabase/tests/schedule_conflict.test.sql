-- P5-1 배정 시간 충돌은 어떤 경로로도 막는다 (pgTAP, 트리거)
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000bba1', 'cf-a@t', '{"role":"instructor","name":"충돌A"}');
insert into shops (id, name, status) values
  ('10000000-0000-0000-0000-00000000bbf1', '충돌샵1', 'approved'),
  ('10000000-0000-0000-0000-00000000bbf2', '충돌샵2', 'approved');
create function pg_temp.a() returns uuid language sql as $$
  select id from instructors where user_id = '00000000-0000-0000-0000-00000000bba1'
$$;
insert into jobs (id, shop_id, starts_at, ends_at, status) values
  ('40000000-0000-0000-0000-00000000bb01', '10000000-0000-0000-0000-00000000bbf1', '2027-01-23 10:00+09', '2027-01-23 12:00+09', 'assigned'),
  ('40000000-0000-0000-0000-00000000bb02', '10000000-0000-0000-0000-00000000bbf2', '2027-01-23 10:30+09', '2027-01-23 11:30+09', 'open'),
  ('40000000-0000-0000-0000-00000000bb03', '10000000-0000-0000-0000-00000000bbf2', '2027-01-23 12:00+09', '2027-01-23 14:00+09', 'open'),
  ('40000000-0000-0000-0000-00000000bb04', '10000000-0000-0000-0000-00000000bbf2', '2027-01-23 15:00+09', '2027-01-23 17:00+09', 'open');
insert into assignments (job_id, instructor_id, final_rate) values ('40000000-0000-0000-0000-00000000bb01', pg_temp.a(), 80000);

select throws_ok($$insert into assignments (job_id, instructor_id, final_rate) values ('40000000-0000-0000-0000-00000000bb02', pg_temp.a(), 80000)$$,
  '23P01', null, '다른 샵 강습과 시간이 겹치는 배정은 막힌다');
select lives_ok($$insert into assignments (job_id, instructor_id, final_rate) values ('40000000-0000-0000-0000-00000000bb03', pg_temp.a(), 80000)$$,
  '끝나는 시각에 바로 시작하는 강습은 된다');
select lives_ok($$insert into assignments (job_id, instructor_id, final_rate) values ('40000000-0000-0000-0000-00000000bb04', pg_temp.a(), 80000)$$,
  '겹치지 않는 배정');
select throws_ok($$update jobs set starts_at = '2027-01-23 13:00+09', ends_at = '2027-01-23 15:30+09' where id = '40000000-0000-0000-0000-00000000bb04'$$,
  '23P01', null, '강습 시간을 바꿔 겹치게 할 수 없다');
select lives_ok($$update jobs set status = 'canceled' where id = '40000000-0000-0000-0000-00000000bb01'$$, '강습을 취소하면');
select lives_ok($$insert into assignments (job_id, instructor_id, final_rate) values ('40000000-0000-0000-0000-00000000bb02', pg_temp.a(), 80000)$$,
  '취소된 강습은 겹침에서 빠진다');
select throws_ok($$update jobs set status = 'assigned' where id = '40000000-0000-0000-0000-00000000bb01'$$,
  '23P01', null, '취소를 되돌려 겹치게 할 수 없다');

select * from finish();
rollback;
