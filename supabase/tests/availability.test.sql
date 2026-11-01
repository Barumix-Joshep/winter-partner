-- P5-2 강사 가능 일정 주간 저장 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000cca1', 'av-a@t', '{"role":"instructor","name":"일정A"}'),
  ('00000000-0000-0000-0000-00000000cca2', 'av-b@t', '{"role":"instructor","name":"일정B"}'),
  ('00000000-0000-0000-0000-00000000ccf1', 'av-s@t', '{"role":"shop_admin","name":"일정샵"}');
create function pg_temp.iid(u text) returns uuid language sql as $$ select id from instructors where user_id = u::uuid $$;
grant execute on function pg_temp.iid(text) to authenticated;
insert into availability (instructor_id, starts_at, ends_at) values
  (pg_temp.iid('00000000-0000-0000-0000-00000000cca1'), '2027-01-24 09:00+09', '2027-01-24 13:00+09'),  -- 이번 주
  (pg_temp.iid('00000000-0000-0000-0000-00000000cca1'), '2027-02-07 09:00+09', '2027-02-07 13:00+09'),  -- 다른 주
  (pg_temp.iid('00000000-0000-0000-0000-00000000cca2'), '2027-01-24 09:00+09', '2027-01-24 13:00+09');  -- 다른 강사

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

select pg_temp.login('00000000-0000-0000-0000-00000000cca1');
select lives_ok($$select set_week_availability('2027-01-24 00:00+09', '2027-01-31 00:00+09',
  '[{"starts":"2027-01-25T09:00:00+09:00","ends":"2027-01-25T18:00:00+09:00"},{"starts":"2027-01-26T18:00:00+09:00","ends":"2027-01-26T22:00:00+09:00"}]')$$,
  '한 주 가능 시간을 저장한다');
select is((select count(*) from availability where starts_at >= '2027-01-24 00:00+09' and starts_at < '2027-01-31 00:00+09'), 2::bigint,
  '그 주는 새 선택으로 바뀐다');
select is((select count(*) from availability where starts_at >= '2027-02-01'), 1::bigint, '다른 주는 그대로');
select throws_ok($$select set_week_availability('2027-01-24 00:00+09', '2027-01-31 00:00+09',
  '[{"starts":"2027-02-01T09:00:00+09:00","ends":"2027-02-01T13:00:00+09:00"}]')$$, '22023', null, '그 주 밖의 시간은 넣을 수 없다');
select throws_ok($$select set_week_availability('2027-01-01 00:00+09', '2027-01-31 00:00+09', '[]')$$, '22023', null, '한 번에 한 주까지');

select set_config('role', 'postgres', true);
select is((select count(*) from availability where instructor_id = pg_temp.iid('00000000-0000-0000-0000-00000000cca2')), 1::bigint, '다른 강사 일정은 그대로');

select pg_temp.login('00000000-0000-0000-0000-00000000ccf1');
select throws_ok($$select set_week_availability('2027-01-24 00:00+09', '2027-01-31 00:00+09', '[]')$$, '42501', null, '강사만 저장한다');

select * from finish();
rollback;
