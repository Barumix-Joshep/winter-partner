-- P13-6 보관·파기: 익명화 결과, 삭제 요청, 3시즌 보관 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000044401', 'rt-shop@t', '{"role":"shop_admin","name":"보관샵장"}'),
  ('00000000-0000-0000-0000-000000044402', 'rt-other@t', '{"role":"shop_admin","name":"이웃가게"}');
insert into shops (id, name, status) values
  ('10000000-0000-0000-0000-000000044401', '보관샵', 'approved'),
  ('10000000-0000-0000-0000-000000044402', '이웃가게', 'approved');
insert into shop_members (shop_id, user_id, is_owner) values
  ('10000000-0000-0000-0000-000000044401', '00000000-0000-0000-0000-000000044401', true),
  ('10000000-0000-0000-0000-000000044402', '00000000-0000-0000-0000-000000044402', true);
insert into customers (id, shop_id, name, phone, guardian_name, guardian_phone, birth_year, level, equipment_size, tags, memo, next_contact_on, created_at) values
  ('d0000000-0000-0000-0000-000000044401', '10000000-0000-0000-0000-000000044401', '지울손님', '010-7000-0001', '보호자', '010-7000-0002', 2015, '초급', '키 130', '{가족}', '샵 메모', '2026-12-01', now()),
  ('d0000000-0000-0000-0000-000000044402', '10000000-0000-0000-0000-000000044401', '오래된손님', '010-7000-0003', null, null, null, '중급', null, '{}', null, null, now() - interval '6 years'),
  ('d0000000-0000-0000-0000-000000044403', '10000000-0000-0000-0000-000000044401', '최근손님', '010-7000-0004', null, null, null, '중급', null, '{}', null, null, now() - interval '6 years');
insert into jobs (id, shop_id, starts_at, ends_at, status, note) values
  ('40000000-0000-0000-0000-000000044401', '10000000-0000-0000-0000-000000044401', '2026-01-10 10:00+09', '2026-01-10 12:00+09', 'approved', '지울손님 요청: 겁이 많음'),
  ('40000000-0000-0000-0000-000000044402', '10000000-0000-0000-0000-000000044401', now() - interval '5 years', now() - interval '5 years' + interval '2 hours', 'approved', '오래된 요청'),
  ('40000000-0000-0000-0000-000000044403', '10000000-0000-0000-0000-000000044401', now() - interval '1 year', now() - interval '1 year' + interval '2 hours', 'approved', null);
insert into job_customers (job_id, customer_id) values
  ('40000000-0000-0000-0000-000000044401', 'd0000000-0000-0000-0000-000000044401'),
  ('40000000-0000-0000-0000-000000044402', 'd0000000-0000-0000-0000-000000044402'),
  ('40000000-0000-0000-0000-000000044403', 'd0000000-0000-0000-0000-000000044403');
insert into assignments (job_id, final_rate, lesson_note) values
  ('40000000-0000-0000-0000-000000044401', 80000, '플루그 숙달'),
  ('40000000-0000-0000-0000-000000044402', 80000, '오래된 메모');
insert into customer_contacts (shop_id, customer_id, channel, memo) values
  ('10000000-0000-0000-0000-000000044401', 'd0000000-0000-0000-0000-000000044401', 'phone', '안부 전화');

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- 시즌: 11월~다음 해 4월
select is(private.season_of('2026-12-20 10:00+09'), 2026, '12월은 그해 시즌');
select is(private.season_of('2027-03-01 10:00+09'), 2026, '3월은 전년 시즌');

-- 삭제 요청
select pg_temp.login('00000000-0000-0000-0000-000000044402');
select throws_ok($$select erase_customer('d0000000-0000-0000-0000-000000044401', '익명화')$$, '42501', null, '다른 샵 손님은 지울 수 없다');
select pg_temp.login('00000000-0000-0000-0000-000000044401');
select throws_ok($$select erase_customer('d0000000-0000-0000-0000-000000044401', '확인')$$, '22023', null, '확인 문구가 맞아야 한다');
select lives_ok($$select erase_customer('d0000000-0000-0000-0000-000000044401', '익명화')$$, '삭제 요청 처리');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select (name, phone, guardian_name, guardian_phone, birth_year, memo, equipment_size, tags, next_contact_on) from customers where id = 'd0000000-0000-0000-0000-000000044401'),
          ('익명 손님'::text, null::text, null::text, null::text, null::int, null::text, null::text, '{}'::text[], null::date), '이름·연락처·보호자·메모 제거');
select is((select level from customers where id = 'd0000000-0000-0000-0000-000000044401'), '초급', '통계용 레벨은 남는다');
select ok((select anonymized_at is not null from customers where id = 'd0000000-0000-0000-0000-000000044401'), '익명화 시각');
select is((select count(*)::int from customer_contacts where customer_id = 'd0000000-0000-0000-0000-000000044401'), 0, '연락 기록 삭제');
select is((select (j.note, a.lesson_note) from jobs j join assignments a on a.job_id = j.id where j.id = '40000000-0000-0000-0000-000000044401'),
          (null::text, null::text), '강습 요청 사항·수업 메모 제거');
select is((select count(*)::int from job_customers where customer_id = 'd0000000-0000-0000-0000-000000044401'), 1, '강습 이력(통계)은 남는다');
select is((select reason from customer_erasures where customer_id = 'd0000000-0000-0000-0000-000000044401'), 'request', '처리 기록');

-- 보관 기간: 마지막 강습 시즌 뒤 3시즌이 지나면 익명화
select is(purge_expired_customers(), 1, '오래된 손님 1명 익명화');
select is((select name from customers where id = 'd0000000-0000-0000-0000-000000044402'), '익명 손님', '5년 전 마지막 강습 → 익명화');
select is((select name from customers where id = 'd0000000-0000-0000-0000-000000044403'), '최근손님', '1년 전 강습이 있으면 남는다 (가입은 오래됐어도)');
select is((select reason from customer_erasures where customer_id = 'd0000000-0000-0000-0000-000000044402'), 'retention', '보관 기간 처리 기록');

insert into customer_consents (shop_id, customer_id, kind, granted, subject, method, text_version)
values ('10000000-0000-0000-0000-000000044401', 'd0000000-0000-0000-0000-000000044401', 'marketing', true, 'self', 'qr', 'v1');
select is((select count(*)::int from marketing_recipients('10000000-0000-0000-0000-000000044401')), 0, '익명화된 손님은 발송 대상이 아니다');

select * from finish();
rollback;
