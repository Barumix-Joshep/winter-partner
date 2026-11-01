-- P4-2 직접 의뢰와 강사 수락·거절 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000008f1', 'of-shop@t', '{"role":"shop_admin","name":"의뢰샵"}'),
  ('00000000-0000-0000-0000-0000000008f2', 'of-shop2@t', '{"role":"shop_admin","name":"남의샵"}'),
  ('00000000-0000-0000-0000-0000000008a1', 'of-a@t', '{"role":"instructor","name":"의뢰A"}'),
  ('00000000-0000-0000-0000-0000000008b1', 'of-b@t', '{"role":"instructor","name":"의뢰B"}'),
  ('00000000-0000-0000-0000-0000000008c1', 'of-c@t', '{"role":"instructor","name":"남의전속C"}');
insert into shops (id, name, status) values
  ('10000000-0000-0000-0000-0000000008f1', '의뢰샵', 'approved'),
  ('10000000-0000-0000-0000-0000000008f2', '남의샵', 'approved');
insert into shop_members (shop_id, user_id, is_owner) values
  ('10000000-0000-0000-0000-0000000008f1', '00000000-0000-0000-0000-0000000008f1', true),
  ('10000000-0000-0000-0000-0000000008f2', '00000000-0000-0000-0000-0000000008f2', true);
create function pg_temp.iid(n text) returns uuid language sql as $$
  select i.id from instructors i join profiles p on p.id = i.user_id where p.name = n
$$;
grant execute on function pg_temp.iid(text) to authenticated;
insert into shop_instructors (shop_id, instructor_id) values ('10000000-0000-0000-0000-0000000008f2', pg_temp.iid('남의전속C'));
insert into customers (id, shop_id, name, phone, level) values
  ('30000000-0000-0000-0000-0000000008f1', '10000000-0000-0000-0000-0000000008f1', '의뢰손님', '010-0000-8888', '초급');
insert into jobs (id, shop_id, starts_at, ends_at, instructor_rate, status, note) values
  ('40000000-0000-0000-0000-0000000008a1', '10000000-0000-0000-0000-0000000008f1', '2026-12-27 10:00+09', '2026-12-27 12:00+09', 90000, 'draft', '첫 강습'),
  ('40000000-0000-0000-0000-0000000008a2', '10000000-0000-0000-0000-0000000008f1', '2026-12-27 11:00+09', '2026-12-27 13:00+09', 90000, 'draft', '겹치는 강습'),
  ('40000000-0000-0000-0000-0000000008a3', '10000000-0000-0000-0000-0000000008f1', '2026-12-28 10:00+09', '2026-12-28 12:00+09', null, 'draft', '금액 없음'),
  ('40000000-0000-0000-0000-0000000008a4', '10000000-0000-0000-0000-0000000008f1', '2026-12-29 10:00+09', '2026-12-29 12:00+09', 90000, 'draft', '거절될 강습');
insert into job_customers values ('40000000-0000-0000-0000-0000000008a1', '30000000-0000-0000-0000-0000000008f1');

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- 샵
select pg_temp.login('00000000-0000-0000-0000-0000000008f1');
select lives_ok($$select send_job_offer('40000000-0000-0000-0000-0000000008a1', pg_temp.iid('의뢰A'))$$, '샵이 강사에게 직접 의뢰한다');
select is((select status::text || '/' || assign_mode::text from jobs where id = '40000000-0000-0000-0000-0000000008a1'), 'open/direct', '강습은 의뢰 응답 대기');
select throws_ok($$select send_job_offer('40000000-0000-0000-0000-0000000008a3', pg_temp.iid('의뢰A'))$$, '22023', null, '강사 지급액이 없으면 의뢰할 수 없다');
select throws_ok($$select send_job_offer('40000000-0000-0000-0000-0000000008a4', pg_temp.iid('남의전속C'))$$, '22023', null, '다른 샵 전속에게는 의뢰할 수 없다');
select lives_ok($$select send_job_offer('40000000-0000-0000-0000-0000000008a2', pg_temp.iid('의뢰A'))$$, '겹치는 강습도 의뢰는 보낼 수 있다');
select lives_ok($$select send_job_offer('40000000-0000-0000-0000-0000000008a4', pg_temp.iid('의뢰B'))$$, '다른 강사에게도 의뢰');

select pg_temp.login('00000000-0000-0000-0000-0000000008f2');
select throws_ok($$select send_job_offer('40000000-0000-0000-0000-0000000008a4', pg_temp.iid('의뢰A'))$$, '42501', null, '남의 샵 강습으로는 의뢰할 수 없다');

-- 강사 A
select pg_temp.login('00000000-0000-0000-0000-0000000008a1');
select ok(exists(select 1 from notifications where kind = 'job_offer'), '의뢰 알림을 받는다');
select is((select note from jobs where id = '40000000-0000-0000-0000-0000000008a1'), '첫 강습', '의뢰받은 강습을 본다');
select is((select count(*) from customers), 0::bigint, '손님 연락처는 못 본다');
select is((select array_agg(level) from job_customer_levels('40000000-0000-0000-0000-0000000008a1')), array['초급'], '손님 레벨은 본다');
select lives_ok($$select respond_job_offer((select id from job_offers where job_id = '40000000-0000-0000-0000-0000000008a1'), true)$$, '수락한다');
select is((select status::text from jobs where id = '40000000-0000-0000-0000-0000000008a1'), 'assigned', '수락하면 배정 확정');
select throws_ok($$select respond_job_offer((select id from job_offers where job_id = '40000000-0000-0000-0000-0000000008a2'), true)$$,
  '22023', null, '시간이 겹치는 강습은 수락할 수 없다');

-- 강사 B
select pg_temp.login('00000000-0000-0000-0000-0000000008b1');
select throws_ok($$select respond_job_offer((select id from job_offers where job_id = '40000000-0000-0000-0000-0000000008a2' limit 1), true)$$,
  '42501', null, '남의 의뢰에는 답할 수 없다');
select lives_ok($$select respond_job_offer((select id from job_offers where job_id = '40000000-0000-0000-0000-0000000008a4'), false)$$, '거절한다');

select * from finish();
rollback;
