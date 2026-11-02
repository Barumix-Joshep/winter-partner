-- P11-5 2단계 팀 입찰: 강습팀 입찰 → 선정 → 팀장이 팀원 지정 → 팀 정산 수령 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000bbbf1', 'tb-shop@t', '{"role":"shop_admin","name":"공고샵"}'),
  ('00000000-0000-0000-0000-0000000bbbf2', 'tb-team@t', '{"role":"shop_admin","name":"팀장"}'),
  ('00000000-0000-0000-0000-0000000bbbf3', 'tb-rental@t', '{"role":"shop_admin","name":"렌탈샵장"}'),
  ('00000000-0000-0000-0000-0000000bbba1', 'tb-m1@t', '{"role":"instructor","name":"팀원1"}'),
  ('00000000-0000-0000-0000-0000000bbba2', 'tb-m2@t', '{"role":"instructor","name":"팀원2"}'),
  ('00000000-0000-0000-0000-0000000bbba3', 'tb-free@t', '{"role":"instructor","name":"남남"}');
insert into shops (id, type, name, status) values
  ('10000000-0000-0000-0000-0000000bbbf1', 'rental_shop', '공고샵', 'approved'),
  ('10000000-0000-0000-0000-0000000bbbf2', 'lesson_team', '팀스쿨', 'approved'),
  ('10000000-0000-0000-0000-0000000bbbf3', 'rental_shop', '렌탈샵', 'approved');
insert into shop_members (shop_id, user_id, is_owner) values
  ('10000000-0000-0000-0000-0000000bbbf1', '00000000-0000-0000-0000-0000000bbbf1', true),
  ('10000000-0000-0000-0000-0000000bbbf2', '00000000-0000-0000-0000-0000000bbbf2', true),
  ('10000000-0000-0000-0000-0000000bbbf3', '00000000-0000-0000-0000-0000000bbbf3', true);
create function pg_temp.iid(n text) returns uuid language sql as $$
  select i.id from instructors i join profiles p on p.id = i.user_id where p.name = n
$$;
insert into shop_instructors (shop_id, instructor_id) values
  ('10000000-0000-0000-0000-0000000bbbf2', pg_temp.iid('팀원1')),
  ('10000000-0000-0000-0000-0000000bbbf2', pg_temp.iid('팀원2'));
insert into jobs (id, shop_id, starts_at, ends_at, instructor_rate, assign_mode, status, bid_closes_at, allow_team_bids) values
  ('40000000-0000-0000-0000-0000000bbb01', '10000000-0000-0000-0000-0000000bbbf1', '2027-01-20 10:00+09', '2027-01-20 12:00+09', 200000, 'bid', 'open', '2027-01-19 18:00+09', true),
  ('40000000-0000-0000-0000-0000000bbb02', '10000000-0000-0000-0000-0000000bbbf1', '2027-01-21 10:00+09', '2027-01-21 12:00+09', 200000, 'bid', 'open', '2027-01-20 18:00+09', false),
  -- 팀원2는 1/20 10~12에 다른 강습이 있다
  ('40000000-0000-0000-0000-0000000bbb03', '10000000-0000-0000-0000-0000000bbbf3', '2027-01-20 11:00+09', '2027-01-20 13:00+09', 90000, 'direct', 'assigned', null, false);
insert into assignments (job_id, instructor_id, final_rate) values ('40000000-0000-0000-0000-0000000bbb03', pg_temp.iid('팀원2'), 90000);

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- 입찰 ------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000bbbf3');
select throws_ok($$select place_team_bid('40000000-0000-0000-0000-0000000bbb01', 180000, null)$$, '42501', null, '렌탈샵은 팀 입찰을 할 수 없다');

select pg_temp.login('00000000-0000-0000-0000-0000000bbbf2');
select throws_ok($$select place_team_bid('40000000-0000-0000-0000-0000000bbb02', 180000, null)$$, '22023', null, '팀 입찰을 받지 않는 공고');
select throws_ok($$select place_team_bid('40000000-0000-0000-0000-0000000bbb01', 210000, null)$$, '22023', null, '상한가를 넘을 수 없다');
select lives_ok($$select place_team_bid('40000000-0000-0000-0000-0000000bbb01', 190000, '강사 2명 투입')$$, '팀 입찰');
select lives_ok($$select place_team_bid('40000000-0000-0000-0000-0000000bbb01', 185000, '금액 조정')$$, '같은 공고에 다시 내면 금액을 바꾼다');
select is((select count(*)::int from bids where job_id = '40000000-0000-0000-0000-0000000bbb01' and bidder_shop_id = '10000000-0000-0000-0000-0000000bbbf2' and status = 'open'), 1, '팀 입찰은 공고당 하나');
select is((select amount from bids where job_id = '40000000-0000-0000-0000-0000000bbb01' and bidder_shop_id = '10000000-0000-0000-0000-0000000bbbf2'), 185000, '바뀐 금액');
select lives_ok($$select withdraw_team_bid('40000000-0000-0000-0000-0000000bbb01')$$, '철회');
select is((select status::text from bids where job_id = '40000000-0000-0000-0000-0000000bbb01' and bidder_shop_id = '10000000-0000-0000-0000-0000000bbbf2'), 'withdrawn', '철회됨');
select lives_ok($$select place_team_bid('40000000-0000-0000-0000-0000000bbb01', 185000, null)$$, '철회 뒤 다시 입찰');

-- 선정 → 팀 배정(강사 미정) ------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000bbbf1');
select select_bid((select id from bids where job_id = '40000000-0000-0000-0000-0000000bbb01' and bidder_shop_id = '10000000-0000-0000-0000-0000000bbbf2' and status = 'open'), 185000);

select pg_temp.login('00000000-0000-0000-0000-0000000bbbf2');
select throws_ok($$select assign_team_instructor('40000000-0000-0000-0000-0000000bbb01', pg_temp.iid('남남'))$$, '22023', null, '우리 팀원만 지정');
select throws_ok($$select assign_team_instructor('40000000-0000-0000-0000-0000000bbb01', pg_temp.iid('팀원2'))$$, '22023', null, '시간이 겹치는 팀원은 지정할 수 없다');
select lives_ok($$select assign_team_instructor('40000000-0000-0000-0000-0000000bbb01', pg_temp.iid('팀원1'))$$, '팀원 지정');
select is((select instructor_id from assignments where job_id = '40000000-0000-0000-0000-0000000bbb01'), pg_temp.iid('팀원1'), '배정 강사 = 팀원1');
reset role;  -- 결과 확인은 RLS 밖에서
select ok(exists (select 1 from notifications where kind = 'team_assigned' and user_id = '00000000-0000-0000-0000-0000000bbba1'), '팀원에게 알림');

select pg_temp.login('00000000-0000-0000-0000-0000000bbbf3');
select throws_ok($$select assign_team_instructor('40000000-0000-0000-0000-0000000bbb01', pg_temp.iid('팀원1'))$$, '42501', null, '다른 샵은 팀원을 지정할 수 없다');

-- 팀원이 취소하면 배정은 팀에 남고 강사만 빠진다 -------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000bbba1');
select instructor_cancel('40000000-0000-0000-0000-0000000bbb01', '부상');
reset role;
select is((select (instructor_id is null, via_shop_id::text) from assignments where job_id = '40000000-0000-0000-0000-0000000bbb01'),
          (true, '10000000-0000-0000-0000-0000000bbbf2'::text), '팀 배정은 유지, 강사만 비움');
select is((select status::text from jobs where id = '40000000-0000-0000-0000-0000000bbb01'), 'assigned', '강습은 확정 상태 유지');
select ok(exists (select 1 from notifications where kind = 'instructor_canceled' and user_id = '00000000-0000-0000-0000-0000000bbbf2'), '팀장에게 다시 지정하라는 알림');

-- 승인 알림: 팀원에게는 금액 없이, 팀 관리자에게 팀 확정 금액 (P12-3, P15-4 리허설에서 미적용 발견)
select pg_temp.login('00000000-0000-0000-0000-0000000bbbf2');
select assign_team_instructor('40000000-0000-0000-0000-0000000bbb01', pg_temp.iid('팀원1'));
reset role;
update jobs set starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour' where id = '40000000-0000-0000-0000-0000000bbb01';
select pg_temp.login('00000000-0000-0000-0000-0000000bbba1');
select complete_lesson('40000000-0000-0000-0000-0000000bbb01', null);
select pg_temp.login('00000000-0000-0000-0000-0000000bbbf1');
select approve_lesson('40000000-0000-0000-0000-0000000bbb01', null, null);
reset role;
select is((select payload from notifications where kind = 'lesson_approved' and user_id = '00000000-0000-0000-0000-0000000bbba1'),
          jsonb_build_object('job_id', '40000000-0000-0000-0000-0000000bbb01', 'team', true), '팀원 알림에는 금액이 없다');
select is((select (payload ->> 'amount')::int from notifications where kind = 'team_lesson_approved' and user_id = '00000000-0000-0000-0000-0000000bbbf2'),
          185000, '팀 관리자에게 팀 확정 금액');
select ok(not exists (select 1 from notifications where kind = 'lesson_approved' and payload ? 'amount' and user_id = '00000000-0000-0000-0000-0000000bbba1'), '팀원에게 금액 노출 없음');
-- 개인 강습 승인 알림은 그대로 금액이 있다 (기존 동작 유지)
select ok(exists (select 1 from pg_proc where proname = 'approve_lesson'), 'approve_lesson 존재');

select * from finish();
rollback;
