-- P4-3 입찰 공고와 금액 제시 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000009f1', 'bd-shop@t', '{"role":"shop_admin","name":"공고샵"}'),
  ('00000000-0000-0000-0000-0000000009a1', 'bd-a@t', '{"role":"instructor","name":"입찰A"}'),
  ('00000000-0000-0000-0000-0000000009b1', 'bd-b@t', '{"role":"instructor","name":"입찰B"}'),
  ('00000000-0000-0000-0000-0000000009e1', 'bd-e@t', '{"role":"instructor","name":"전속E"}');
insert into shops (id, name, status) values ('10000000-0000-0000-0000-0000000009f1', '공고샵', 'approved');
insert into shop_members (shop_id, user_id, is_owner) values ('10000000-0000-0000-0000-0000000009f1', '00000000-0000-0000-0000-0000000009f1', true);
create function pg_temp.iid(n text) returns uuid language sql as $$
  select i.id from instructors i join profiles p on p.id = i.user_id where p.name = n
$$;
grant execute on function pg_temp.iid(text) to authenticated;
insert into shop_instructors (shop_id, instructor_id) values ('10000000-0000-0000-0000-0000000009f1', pg_temp.iid('전속E'));
insert into jobs (id, shop_id, starts_at, ends_at, instructor_rate, status, note) values
  ('40000000-0000-0000-0000-0000000009a1', '10000000-0000-0000-0000-0000000009f1', '2027-01-09 10:00+09', '2027-01-09 12:00+09', 150000, 'draft', '공고 강습'),
  ('40000000-0000-0000-0000-0000000009a2', '10000000-0000-0000-0000-0000000009f1', '2027-01-10 10:00+09', '2027-01-10 12:00+09', null, 'draft', '상한 없음'),
  ('40000000-0000-0000-0000-0000000009a3', '10000000-0000-0000-0000-0000000009f1', '2027-01-09 09:00+09', '2027-01-09 11:00+09', 90000, 'assigned', 'B 확정 강습');
insert into assignments (job_id, instructor_id, final_rate) values ('40000000-0000-0000-0000-0000000009a3', pg_temp.iid('입찰B'), 90000);

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

select pg_temp.login('00000000-0000-0000-0000-0000000009f1');
select throws_ok($$select publish_bid_job('40000000-0000-0000-0000-0000000009a2', '2027-01-08 18:00+09', false)$$, '22023', null, '상한가가 없으면 공고할 수 없다');
select throws_ok($$select publish_bid_job('40000000-0000-0000-0000-0000000009a1', '2027-01-09 11:00+09', false)$$, '22023', null, '마감은 강습 시작 전이어야 한다');
select lives_ok($$select publish_bid_job('40000000-0000-0000-0000-0000000009a1', '2027-01-08 18:00+09', false)$$, '입찰 공고를 올린다');
select is((select status::text || '/' || assign_mode::text from jobs where id = '40000000-0000-0000-0000-0000000009a1'), 'open/bid', '공고 중');

select pg_temp.login('00000000-0000-0000-0000-0000000009e1');
select is((select count(*) from jobs where id = '40000000-0000-0000-0000-0000000009a1'), 0::bigint, '전속 강사에게는 우리 샵 공고도 안 보인다');
select throws_ok($$select place_bid('40000000-0000-0000-0000-0000000009a1', 100000, null)$$, '42501', null, '전속 강사는 입찰할 수 없다');

select pg_temp.login('00000000-0000-0000-0000-0000000009a1');
select throws_ok($$select place_bid('40000000-0000-0000-0000-0000000009a1', 160000, null)$$, '22023', null, '상한가를 넘을 수 없다');
select lives_ok($$select place_bid('40000000-0000-0000-0000-0000000009a1', 140000, '성인 초급 전문')$$, '프리랜서가 금액을 제시한다');
select lives_ok($$select place_bid('40000000-0000-0000-0000-0000000009a1', 130000, '금액 조정')$$, '다시 내면 금액이 바뀐다');
select is((select array_agg(amount) from bids where job_id = '40000000-0000-0000-0000-0000000009a1'), array[130000], '입찰은 한 건만');

select pg_temp.login('00000000-0000-0000-0000-0000000009b1');
select is((select count(*) from bids), 0::bigint, '다른 강사의 입찰은 안 보인다');
select throws_ok($$select place_bid('40000000-0000-0000-0000-0000000009a1', 120000, null)$$, '22023', null, '확정 강습과 시간이 겹치면 입찰할 수 없다');

select pg_temp.login('00000000-0000-0000-0000-0000000009f1');
select is((select count(*) from bids where job_id = '40000000-0000-0000-0000-0000000009a1'), 1::bigint, '샵은 받은 입찰을 본다');
select ok(exists(select 1 from notifications where kind = 'bid_placed'), '샵에 입찰 알림');

select pg_temp.login('00000000-0000-0000-0000-0000000009a1');
select lives_ok($$select withdraw_bid('40000000-0000-0000-0000-0000000009a1')$$, '입찰을 철회한다');

-- 마감 뒤에는 입찰할 수 없다
select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
update jobs set bid_closes_at = now() - interval '1 hour' where id = '40000000-0000-0000-0000-0000000009a1';
select pg_temp.login('00000000-0000-0000-0000-0000000009a1');
select throws_ok($$select place_bid('40000000-0000-0000-0000-0000000009a1', 100000, null)$$, '22023', null, '마감된 공고에는 입찰할 수 없다');

select * from finish();
rollback;
