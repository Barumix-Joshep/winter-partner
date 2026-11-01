-- P5-3 완료 보고·강습 노트와 샵 승인 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000dda1', 'cp-a@t', '{"role":"instructor","name":"완료A"}'),
  ('00000000-0000-0000-0000-00000000ddb1', 'cp-b@t', '{"role":"instructor","name":"완료B"}'),
  ('00000000-0000-0000-0000-00000000ddf1', 'cp-s@t', '{"role":"shop_admin","name":"완료샵"}'),
  ('00000000-0000-0000-0000-00000000ddf2', 'cp-s2@t', '{"role":"shop_admin","name":"옆완료샵"}');
insert into shops (id, name, status) values
  ('10000000-0000-0000-0000-00000000ddf1', '완료샵', 'approved'),
  ('10000000-0000-0000-0000-00000000ddf2', '옆완료샵', 'approved');
insert into shop_members (shop_id, user_id, is_owner) values
  ('10000000-0000-0000-0000-00000000ddf1', '00000000-0000-0000-0000-00000000ddf1', true),
  ('10000000-0000-0000-0000-00000000ddf2', '00000000-0000-0000-0000-00000000ddf2', true);
create function pg_temp.iid(u text) returns uuid language sql as $$ select id from instructors where user_id = u::uuid $$;
insert into jobs (id, shop_id, starts_at, ends_at, status) values
  ('40000000-0000-0000-0000-00000000dd01', '10000000-0000-0000-0000-00000000ddf1', now() - interval '3 hours', now() - interval '1 hour', 'assigned'),
  ('40000000-0000-0000-0000-00000000dd02', '10000000-0000-0000-0000-00000000ddf1', now() + interval '1 day', now() + interval '1 day 2 hours', 'assigned');
insert into assignments (job_id, instructor_id, final_rate) values
  ('40000000-0000-0000-0000-00000000dd01', pg_temp.iid('00000000-0000-0000-0000-00000000dda1'), 80000),
  ('40000000-0000-0000-0000-00000000dd02', pg_temp.iid('00000000-0000-0000-0000-00000000dda1'), 80000);

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

select pg_temp.login('00000000-0000-0000-0000-00000000ddb1');
select throws_ok($$select complete_lesson('40000000-0000-0000-0000-00000000dd01', '노트')$$, '42501', null, '배정된 강사만 완료 보고를 한다');

select pg_temp.login('00000000-0000-0000-0000-00000000dda1');
select throws_ok($$select complete_lesson('40000000-0000-0000-0000-00000000dd02', '노트')$$, '22023', null, '강습 시작 전에는 보고할 수 없다');
select lives_ok($$select complete_lesson('40000000-0000-0000-0000-00000000dd01', '사이드슬립까지. 다음엔 비기너 턴')$$, '완료 보고');
select is((select lesson_note from assignments where job_id = '40000000-0000-0000-0000-00000000dd01'), '사이드슬립까지. 다음엔 비기너 턴', '강습 노트 저장');
select is((select status::text from jobs where id = '40000000-0000-0000-0000-00000000dd01'), 'done', '강습은 완료 보고 상태');
select throws_ok($$select complete_lesson('40000000-0000-0000-0000-00000000dd01', '다시')$$, '22023', null, '두 번 보고할 수 없다');
select throws_ok($$select approve_lesson('40000000-0000-0000-0000-00000000dd01', 5, null)$$, '42501', null, '강사는 승인할 수 없다');

select pg_temp.login('00000000-0000-0000-0000-00000000ddf2');
select throws_ok($$select approve_lesson('40000000-0000-0000-0000-00000000dd01', 5, null)$$, '42501', null, '다른 샵은 승인할 수 없다');

select pg_temp.login('00000000-0000-0000-0000-00000000ddf1');
select ok(exists(select 1 from notifications where kind = 'lesson_completed'), '샵에 완료 보고 알림');
select throws_ok($$select approve_lesson('40000000-0000-0000-0000-00000000dd02', null, null)$$, '22023', null, '보고 전에는 승인할 수 없다');
select lives_ok($$select approve_lesson('40000000-0000-0000-0000-00000000dd01', 5, '친절해요')$$, '샵이 승인하고 평가한다');
select is((select status::text || '/' || (select (approved_by = auth.uid())::text from assignments where job_id = '40000000-0000-0000-0000-00000000dd01')
           from jobs where id = '40000000-0000-0000-0000-00000000dd01'), 'approved/true', '승인 상태와 승인자');
select is((select score from ratings where job_id = '40000000-0000-0000-0000-00000000dd01'), 5, '평가가 남는다');

select * from finish();
rollback;
