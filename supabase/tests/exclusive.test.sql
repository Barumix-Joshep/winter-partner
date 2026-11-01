-- P3-4 전속 강사 등록 (제안 → 강사 수락) (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000006a1', 'ex-inst@t', '{"role":"instructor","name":"제안받는강사"}'),
  ('00000000-0000-0000-0000-0000000006f1', 'ex-shop1@t', '{"role":"shop_admin","name":"제안샵"}'),
  ('00000000-0000-0000-0000-0000000006f2', 'ex-shop2@t', '{"role":"shop_admin","name":"경쟁샵"}');
insert into shops (id, name, status) values
  ('10000000-0000-0000-0000-0000000006f1', '제안샵', 'approved'),
  ('10000000-0000-0000-0000-0000000006f2', '경쟁샵', 'approved');
insert into shop_members (shop_id, user_id, is_owner) values
  ('10000000-0000-0000-0000-0000000006f1', '00000000-0000-0000-0000-0000000006f1', true),
  ('10000000-0000-0000-0000-0000000006f2', '00000000-0000-0000-0000-0000000006f2', true);
create function pg_temp.inst() returns uuid language sql as $$
  select id from instructors where user_id = '00000000-0000-0000-0000-0000000006a1'
$$;
-- 강사가 입찰 중인 공개 공고
insert into jobs (id, shop_id, starts_at, ends_at, assign_mode, status) values
  ('40000000-0000-0000-0000-0000000006b1', '10000000-0000-0000-0000-0000000006f2', '2026-12-24 10:00+09', '2026-12-24 12:00+09', 'bid', 'open');
insert into bids (id, job_id, instructor_id, amount) values
  ('60000000-0000-0000-0000-0000000006b1', '40000000-0000-0000-0000-0000000006b1', pg_temp.inst(), 90000);

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;
grant execute on function pg_temp.inst() to authenticated;

-- 샵1: 직접 전속 등록은 막히고, 제안만 할 수 있다
select pg_temp.login('00000000-0000-0000-0000-0000000006f1');
select throws_ok($$insert into shop_instructors (shop_id, instructor_id) values ('10000000-0000-0000-0000-0000000006f1', pg_temp.inst())$$,
  '42501', null, '샵이 강사를 일방적으로 전속 등록할 수 없다');
select lives_ok($$insert into exclusive_invites (shop_id, instructor_id, exclusive_rate) values ('10000000-0000-0000-0000-0000000006f1', pg_temp.inst(), 90000)$$,
  '샵은 전속을 제안한다');

-- 샵2도 제안
select pg_temp.login('00000000-0000-0000-0000-0000000006f2');
select is((select count(*) from exclusive_invites), 0::bigint, '다른 샵의 제안은 안 보인다');
insert into exclusive_invites (shop_id, instructor_id) values ('10000000-0000-0000-0000-0000000006f2', pg_temp.inst());

-- 강사
select pg_temp.login('00000000-0000-0000-0000-0000000006a1');
select is((select count(*) from exclusive_invites where status = 'pending'), 2::bigint, '강사는 받은 제안을 본다');
select throws_ok($$update exclusive_invites set status = 'accepted'$$, '42501', null, '수락은 함수로만 한다');
select lives_ok($$select accept_exclusive_invite((select id from exclusive_invites where shop_id = '10000000-0000-0000-0000-0000000006f1'))$$,
  '강사가 수락한다');
select is((select shop_id from shop_instructors where instructor_id = pg_temp.inst()), '10000000-0000-0000-0000-0000000006f1'::uuid, '수락하면 전속이 된다');
select is((select status::text from bids where id = '60000000-0000-0000-0000-0000000006b1'), 'withdrawn', '진행 중이던 입찰은 철회된다');
select is((select status::text from exclusive_invites where shop_id = '10000000-0000-0000-0000-0000000006f2'), 'declined', '다른 제안은 자동으로 거절된다');

-- 이미 전속인 강사에게는 새 제안을 못 한다
select pg_temp.login('00000000-0000-0000-0000-0000000006f2');
select throws_ok($$insert into exclusive_invites (shop_id, instructor_id) values ('10000000-0000-0000-0000-0000000006f2', pg_temp.inst())$$,
  '42501', null, '다른 샵 전속 강사에게는 제안할 수 없다');

-- 승인 전 샵은 제안할 수 없다
select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
update shops set status = 'pending' where id = '10000000-0000-0000-0000-0000000006f2';
select pg_temp.login('00000000-0000-0000-0000-0000000006f2');
select throws_ok($$insert into exclusive_invites (shop_id, instructor_id) values ('10000000-0000-0000-0000-0000000006f2', (select id from instructors limit 1))$$,
  '42501', null, '승인 전 샵은 제안할 수 없다');

-- 샵1이 해지하면 다시 프리랜서
select pg_temp.login('00000000-0000-0000-0000-0000000006f1');
select lives_ok($$delete from shop_instructors where instructor_id = pg_temp.inst()$$, '샵은 전속을 해지한다');
select pg_temp.login('00000000-0000-0000-0000-0000000006a1');
select ok(not exists (select 1 from shop_instructors where instructor_id = pg_temp.inst()), '해지되면 프리랜서로 돌아간다');

select * from finish();
rollback;
