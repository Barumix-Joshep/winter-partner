-- P4-4 관리자 선정과 금액 조정 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000aaf1', 'sel-shop@t', '{"role":"shop_admin","name":"선정샵"}'),
  ('00000000-0000-0000-0000-00000000aaf2', 'sel-other@t', '{"role":"shop_admin","name":"구경샵"}'),
  ('00000000-0000-0000-0000-00000000aaa1', 'sel-a@t', '{"role":"instructor","name":"선정A"}'),
  ('00000000-0000-0000-0000-00000000aab1', 'sel-b@t', '{"role":"instructor","name":"선정B"}');
insert into shops (id, name, status) values
  ('10000000-0000-0000-0000-00000000aaf1', '선정샵', 'approved'),
  ('10000000-0000-0000-0000-00000000aaf2', '구경샵', 'approved');
insert into shop_members (shop_id, user_id, is_owner) values
  ('10000000-0000-0000-0000-00000000aaf1', '00000000-0000-0000-0000-00000000aaf1', true),
  ('10000000-0000-0000-0000-00000000aaf2', '00000000-0000-0000-0000-00000000aaf2', true);
create function pg_temp.iid(n text) returns uuid language sql as $$
  select i.id from instructors i join profiles p on p.id = i.user_id where p.name = n
$$;
insert into jobs (id, shop_id, starts_at, ends_at, instructor_rate, assign_mode, status, bid_closes_at) values
  ('40000000-0000-0000-0000-00000000aaa1', '10000000-0000-0000-0000-00000000aaf1', '2027-01-16 10:00+09', '2027-01-16 12:00+09', 150000, 'bid', 'open', '2027-01-15 18:00+09'),
  ('40000000-0000-0000-0000-00000000aaa2', '10000000-0000-0000-0000-00000000aaf1', '2027-01-17 10:00+09', '2027-01-17 12:00+09', 150000, 'bid', 'open', '2027-01-16 18:00+09'),
  ('40000000-0000-0000-0000-00000000aaa3', '10000000-0000-0000-0000-00000000aaf2', '2027-01-17 09:00+09', '2027-01-17 11:00+09', 90000, 'direct', 'assigned', null);
insert into bids (id, job_id, instructor_id, amount, memo) values
  ('60000000-0000-0000-0000-00000000aaa1', '40000000-0000-0000-0000-00000000aaa1', pg_temp.iid('선정A'), 140000, 'A'),
  ('60000000-0000-0000-0000-00000000aab1', '40000000-0000-0000-0000-00000000aaa1', pg_temp.iid('선정B'), 120000, 'B'),
  ('60000000-0000-0000-0000-00000000aab2', '40000000-0000-0000-0000-00000000aaa2', pg_temp.iid('선정B'), 130000, 'B2');
-- B는 입찰 뒤 다른 샵 강습(1/17 09~11)이 확정됐다
insert into assignments (job_id, instructor_id, final_rate) values ('40000000-0000-0000-0000-00000000aaa3', pg_temp.iid('선정B'), 90000);

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

select pg_temp.login('00000000-0000-0000-0000-00000000aaf2');
select throws_ok($$select select_bid('60000000-0000-0000-0000-00000000aab1', 120000)$$, '42501', null, '남의 공고 입찰은 선정할 수 없다');

select pg_temp.login('00000000-0000-0000-0000-00000000aaa1');
select throws_ok($$select select_bid('60000000-0000-0000-0000-00000000aaa1', 140000)$$, '42501', null, '강사는 선정할 수 없다');

select pg_temp.login('00000000-0000-0000-0000-00000000aaf1');
select throws_ok($$select select_bid('60000000-0000-0000-0000-00000000aab1', 0)$$, '22023', null, '금액은 0보다 커야 한다');
select lives_ok($$select select_bid('60000000-0000-0000-0000-00000000aab1', 125000)$$, '금액을 조정해 선정한다');
select is((select final_rate from assignments where job_id = '40000000-0000-0000-0000-00000000aaa1'), 125000, '조정한 금액이 확정 금액');
select is((select instructor_id from assignments where job_id = '40000000-0000-0000-0000-00000000aaa1'), pg_temp.iid('선정B'), '선정된 강사로 배정');
select is((select status::text from jobs where id = '40000000-0000-0000-0000-00000000aaa1'), 'assigned', '강습 확정');
select is((select status::text from bids where id = '60000000-0000-0000-0000-00000000aaa1'), 'rejected', '나머지 입찰은 탈락');
select set_config('role', 'postgres', true);
select ok(exists(select 1 from notifications n join instructors i on i.user_id = n.user_id
                 where i.id = pg_temp.iid('선정B') and n.kind = 'bid_selected' and (n.payload ->> 'amount')::int = 125000), '선정 알림에 확정 금액');
select pg_temp.login('00000000-0000-0000-0000-00000000aaf1');
select throws_ok($$select select_bid('60000000-0000-0000-0000-00000000aaa1', 140000)$$, '22023', null, '이미 확정된 공고는 다시 선정할 수 없다');
select throws_ok($$select select_bid('60000000-0000-0000-0000-00000000aab2', 130000)$$, '22023', null, '그 사이 시간이 겹치는 강습이 확정된 강사는 선정할 수 없다');

select lives_ok($$select unpublish_bid_job('40000000-0000-0000-0000-00000000aaa2')$$, '공고를 내린다');
select is((select status::text || '/' || (select status::text from bids where id = '60000000-0000-0000-0000-00000000aab2') from jobs where id = '40000000-0000-0000-0000-00000000aaa2'),
  'draft/rejected', '공고를 내리면 임시 저장으로, 입찰은 탈락');

select * from finish();
rollback;
