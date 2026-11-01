-- P7-2 강사 노트 공유 범위와 개인정보 동의 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000bbf01', 'ns-s@t', '{"role":"shop_admin","name":"노트샵","agreed":true}'),
  ('00000000-0000-0000-0000-0000000bbf02', 'ns-s2@t', '{"role":"shop_admin","name":"옆노트샵","agreed":true}'),
  ('00000000-0000-0000-0000-0000000bba01', 'ns-a@t', '{"role":"instructor","name":"이전강사","agreed":true}'),
  ('00000000-0000-0000-0000-0000000bbb01', 'ns-b@t', '{"role":"instructor","name":"다음강사","agreed":true}'),
  ('00000000-0000-0000-0000-0000000bbc01', 'ns-c@t', '{"role":"instructor","name":"상관없는강사"}');
insert into shops (id, name, status) values
  ('10000000-0000-0000-0000-0000000bbf01', '노트샵', 'approved'),
  ('10000000-0000-0000-0000-0000000bbf02', '옆노트샵', 'approved');
create function pg_temp.iid(u text) returns uuid language sql as $$ select id from instructors where user_id = u::uuid $$;
insert into customers (id, shop_id, name, privacy_consent_at) values
  ('30000000-0000-0000-0000-0000000bb001', '10000000-0000-0000-0000-0000000bbf01', '동의손님', now()),
  ('30000000-0000-0000-0000-0000000bb002', '10000000-0000-0000-0000-0000000bbf01', '미동의손님', null);
insert into jobs (id, shop_id, starts_at, ends_at, status) values
  ('40000000-0000-0000-0000-0000000bb001', '10000000-0000-0000-0000-0000000bbf01', '2026-10-01 10:00+09', '2026-10-01 12:00+09', 'approved'),
  ('40000000-0000-0000-0000-0000000bb002', '10000000-0000-0000-0000-0000000bbf01', '2026-10-02 10:00+09', '2026-10-02 12:00+09', 'approved'),
  ('40000000-0000-0000-0000-0000000bb003', '10000000-0000-0000-0000-0000000bbf01', '2026-12-26 10:00+09', '2026-12-26 12:00+09', 'assigned'),
  ('40000000-0000-0000-0000-0000000bb004', '10000000-0000-0000-0000-0000000bbf01', '2026-12-27 10:00+09', '2026-12-27 12:00+09', 'assigned');
insert into job_customers values
  ('40000000-0000-0000-0000-0000000bb001', '30000000-0000-0000-0000-0000000bb001'),
  ('40000000-0000-0000-0000-0000000bb002', '30000000-0000-0000-0000-0000000bb002'),
  ('40000000-0000-0000-0000-0000000bb003', '30000000-0000-0000-0000-0000000bb001'),
  ('40000000-0000-0000-0000-0000000bb004', '30000000-0000-0000-0000-0000000bb002');
insert into assignments (job_id, instructor_id, final_rate, lesson_note) values
  ('40000000-0000-0000-0000-0000000bb001', pg_temp.iid('00000000-0000-0000-0000-0000000bba01'), 80000, '사이드슬립까지'),
  ('40000000-0000-0000-0000-0000000bb002', pg_temp.iid('00000000-0000-0000-0000-0000000bba01'), 80000, '미동의 손님 메모'),
  ('40000000-0000-0000-0000-0000000bb003', pg_temp.iid('00000000-0000-0000-0000-0000000bbb01'), 80000, null),
  ('40000000-0000-0000-0000-0000000bb004', pg_temp.iid('00000000-0000-0000-0000-0000000bbb01'), 80000, null);

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

select ok((select terms_agreed_at is not null and privacy_agreed_at is not null from profiles where id = '00000000-0000-0000-0000-0000000bba01'),
  '가입할 때 약관·개인정보 동의 시각이 남는다');
select ok((select terms_agreed_at is null from profiles where id = '00000000-0000-0000-0000-0000000bbc01'), '동의 표시가 없으면 비워 둔다');

select pg_temp.login('00000000-0000-0000-0000-0000000bbb01');
select is((select array_agg(note) from previous_lesson_notes('40000000-0000-0000-0000-0000000bb003')), array['사이드슬립까지'],
  '다음 강사는 동의한 손님의 지난 수업 메모를 본다');
-- P13-1: 계약 이행 근거로 같은 샵 안에서는 동의와 무관하게 공유 (다른 샵 차단은 아래 테스트)
select is((select count(*) from previous_lesson_notes('40000000-0000-0000-0000-0000000bb004')), 1::bigint, '같은 샵 손님의 지난 메모는 다음 강사에게 공유된다');

select pg_temp.login('00000000-0000-0000-0000-0000000bbc01');
select throws_ok($$select * from previous_lesson_notes('40000000-0000-0000-0000-0000000bb003')$$, '42501', null, '맡지 않은 강사는 볼 수 없다');

select pg_temp.login('00000000-0000-0000-0000-0000000bbf02');
select throws_ok($$select * from previous_lesson_notes('40000000-0000-0000-0000-0000000bb003')$$, '42501', null, '다른 샵은 볼 수 없다');

select pg_temp.login('00000000-0000-0000-0000-0000000bba01');
select lives_ok($$select record_terms_agreement()$$, '기존 회원도 약관에 동의할 수 있다');
select ok((select terms_agreed_at is not null from profiles where id = auth.uid()), '동의 시각 갱신');

select * from finish();
rollback;
