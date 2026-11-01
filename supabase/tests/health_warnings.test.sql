-- P13-4 건강 정보 경고 기록 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000022201', 'hw-shop@t', '{"role":"shop_admin","name":"건강샵"}'),
  ('00000000-0000-0000-0000-000000022202', 'hw-other@t', '{"role":"shop_admin","name":"이웃샵"}'),
  ('00000000-0000-0000-0000-000000022203', 'hw-inst@t', '{"role":"instructor","name":"건강강사"}'),
  ('00000000-0000-0000-0000-000000022204', 'hw-inst2@t', '{"role":"instructor","name":"딴강사"}');
insert into shops (id, name, status) values
  ('10000000-0000-0000-0000-000000022201', '건강샵', 'approved'),
  ('10000000-0000-0000-0000-000000022202', '이웃샵', 'approved');
insert into shop_members (shop_id, user_id, is_owner) values
  ('10000000-0000-0000-0000-000000022201', '00000000-0000-0000-0000-000000022201', true),
  ('10000000-0000-0000-0000-000000022202', '00000000-0000-0000-0000-000000022202', true);
insert into customers (id, shop_id, name) values ('d0000000-0000-0000-0000-000000022201', '10000000-0000-0000-0000-000000022201', '건강손님');
insert into jobs (id, shop_id, starts_at, ends_at, status) values
  ('40000000-0000-0000-0000-000000022201', '10000000-0000-0000-0000-000000022201', now() - interval '3 hours', now() - interval '1 hour', 'assigned');
insert into assignments (job_id, instructor_id, final_rate)
select '40000000-0000-0000-0000-000000022201', i.id, 80000 from instructors i where i.user_id = '00000000-0000-0000-0000-000000022203';

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

select pg_temp.login('00000000-0000-0000-0000-000000022201');
select lives_ok($$select record_health_warning('customer_memo', 'd0000000-0000-0000-0000-000000022201', null, array['골절'])$$, '샵이 손님 메모 경고 기록');
select pg_temp.login('00000000-0000-0000-0000-000000022203');
select lives_ok($$select record_health_warning('lesson_note', null, '40000000-0000-0000-0000-000000022201', array['천식'])$$, '맡은 강사가 수업 메모 경고 기록');
select pg_temp.login('00000000-0000-0000-0000-000000022204');
select throws_ok($$select record_health_warning('lesson_note', null, '40000000-0000-0000-0000-000000022201', array['천식'])$$, '42501', null, '맡지 않은 강사는 기록할 수 없다');
select pg_temp.login('00000000-0000-0000-0000-000000022202');
select throws_ok($$select record_health_warning('customer_memo', 'd0000000-0000-0000-0000-000000022201', null, array['x'])$$, '42501', null, '다른 샵 손님에는 기록 불가');
select is((select count(*)::int from health_warnings), 0, '다른 샵은 경고 기록을 못 본다');
select pg_temp.login('00000000-0000-0000-0000-000000022201');
select is((select count(*)::int from health_warnings), 2, '샵은 자기 샵 경고를 본다');
select is((select array_agg(t order by t) from health_warnings, unnest(terms) t), array['골절', '천식'], '단어만 남는다');

select * from finish();
rollback;
