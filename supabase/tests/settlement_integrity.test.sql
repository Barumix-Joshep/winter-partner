-- P18-1 정산 무결성 (pgTAP)
-- F1 팀원 두 명이 나눠 맡은 팀 강습도 팀 정산서 한 장으로 / F2 발행 뒤 승인된 강습은 다음 달로 이월
-- F3 같은 강습은 한 번만 정산 / F4 샵은 정산 금액·상태를 직접 못 바꾸고 발행은 RPC로만
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000018a01', 'si-a@t', '{"role":"instructor","name":"무결A"}'),
  ('00000000-0000-0000-0000-000000018b01', 'si-b@t', '{"role":"instructor","name":"무결B"}'),
  ('00000000-0000-0000-0000-000000018f01', 'si-s@t', '{"role":"shop_admin","name":"무결샵"}'),
  ('00000000-0000-0000-0000-000000018f02', 'si-t@t', '{"role":"shop_admin","name":"무결팀장"}'),
  ('00000000-0000-0000-0000-000000018f03', 'si-x@t', '{"role":"shop_admin","name":"남의샵"}');
insert into shops (id, type, name, status) values
  ('10000000-0000-0000-0000-000000018f01', 'rental_shop', '무결샵', 'approved'),
  ('10000000-0000-0000-0000-000000018f02', 'lesson_team', '무결팀', 'approved'),
  ('10000000-0000-0000-0000-000000018f03', 'rental_shop', '남의샵', 'approved');
insert into shop_members (shop_id, user_id, is_owner) values
  ('10000000-0000-0000-0000-000000018f01', '00000000-0000-0000-0000-000000018f01', true),
  ('10000000-0000-0000-0000-000000018f02', '00000000-0000-0000-0000-000000018f02', true),
  ('10000000-0000-0000-0000-000000018f03', '00000000-0000-0000-0000-000000018f03', true);
create function pg_temp.iid(u text) returns uuid language sql as $$ select id from instructors where user_id = u::uuid $$;
grant execute on function pg_temp.iid(text) to authenticated;
create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- 2027년 1월: 팀 강습 2건(팀원 A·B가 하나씩), 프리랜서 A 1건
insert into jobs (id, shop_id, starts_at, ends_at, status) values
  ('40000000-0000-0000-0000-000000018001', '10000000-0000-0000-0000-000000018f01', '2027-01-05 10:00+09', '2027-01-05 12:00+09', 'approved'),
  ('40000000-0000-0000-0000-000000018002', '10000000-0000-0000-0000-000000018f01', '2027-01-06 10:00+09', '2027-01-06 12:00+09', 'approved'),
  ('40000000-0000-0000-0000-000000018003', '10000000-0000-0000-0000-000000018f01', '2027-01-07 10:00+09', '2027-01-07 12:00+09', 'approved'),
  ('40000000-0000-0000-0000-000000018004', '10000000-0000-0000-0000-000000018f01', '2027-01-31 23:30+09', '2027-02-01 01:30+09', 'done');
select set_config('app.system_write', 'on', true);
insert into assignments (job_id, instructor_id, via_shop_id, final_rate, approved_at) values
  ('40000000-0000-0000-0000-000000018001', pg_temp.iid('00000000-0000-0000-0000-000000018a01'), '10000000-0000-0000-0000-000000018f02', 200000, now()),
  ('40000000-0000-0000-0000-000000018002', pg_temp.iid('00000000-0000-0000-0000-000000018b01'), '10000000-0000-0000-0000-000000018f02', 150000, now()),
  ('40000000-0000-0000-0000-000000018003', pg_temp.iid('00000000-0000-0000-0000-000000018a01'), null, 100000, now()),
  ('40000000-0000-0000-0000-000000018004', pg_temp.iid('00000000-0000-0000-0000-000000018a01'), null, 90000, null);
select set_config('app.system_write', 'off', true);

-- F1
select pg_temp.login('00000000-0000-0000-0000-000000018f01');
select lives_ok($$select generate_settlements('10000000-0000-0000-0000-000000018f01', '2027-01-01')$$, '팀원 두 명이 나눠 맡아도 집계된다');
select is((select gross || '/' || withholding from settlements where payee_shop_id = '10000000-0000-0000-0000-000000018f02'), '350000/0', '팀 정산서 한 장, 두 강습 합계, 원천세 없음');
select is((select count(*) from settlements where shop_id = '10000000-0000-0000-0000-000000018f01'), 2::bigint, '지급 대상 2곳 (팀·프리랜서 A)');

-- F4: 직접 수정·발행은 막히고 RPC로만
update settlements set gross = 1, net = 1, status = 'paid' where shop_id = '10000000-0000-0000-0000-000000018f01';
select is((select count(*) from settlements where gross = 1 or status = 'paid'), 0::bigint, '샵은 금액·상태를 직접 바꿀 수 없다');
select throws_ok($$insert into settlement_items (settlement_id, assignment_id, amount) select id, null, 1 from settlements limit 1$$, '42501', null, '정산 항목을 직접 넣을 수 없다');
select pg_temp.login('00000000-0000-0000-0000-000000018f03');
select throws_ok($$select issue_settlements('10000000-0000-0000-0000-000000018f01', '2027-01-01')$$, '42501', null, '다른 샵 정산서는 발행할 수 없다');
select pg_temp.login('00000000-0000-0000-0000-000000018f01');
select is((select issue_settlements('10000000-0000-0000-0000-000000018f01', '2027-01-01')), 2, '발행은 RPC로 (2장)');

-- F2: 1/31 23:30 강습이 발행 뒤(2월)에 승인됨 → 1월은 그대로, 2월 정산서로 이월
reset role;
update jobs set status = 'approved' where id = '40000000-0000-0000-0000-000000018004';
select set_config('app.system_write', 'on', true);
update assignments set approved_at = now() where job_id = '40000000-0000-0000-0000-000000018004';
select set_config('app.system_write', 'off', true);
select pg_temp.login('00000000-0000-0000-0000-000000018f01');
select generate_settlements('10000000-0000-0000-0000-000000018f01', '2027-01-01');
select is((select gross from settlements where month = '2027-01-01' and instructor_id = pg_temp.iid('00000000-0000-0000-0000-000000018a01')), 100000, '발행된 1월 정산서는 그대로');
select is((select generate_settlements('10000000-0000-0000-0000-000000018f01', '2027-02-01')), 1, '2월 집계에 이월 1곳');
select is((select gross || '/' || withholding || '/' || net from settlements where month = '2027-02-01'), '90000/2970/87030', '이월된 강습이 2월 정산서에 (3.3%)');

-- F3: 같은 강습이 두 번 정산되지 않는다
select generate_settlements('10000000-0000-0000-0000-000000018f01', '2027-02-01');
select generate_settlements('10000000-0000-0000-0000-000000018f01', '2027-01-01');
select is((select count(*) from settlement_items where assignment_id = (select id from assignments where job_id = '40000000-0000-0000-0000-000000018004')), 1::bigint, '다시 집계해도 한 번만');
reset role;
select throws_ok($$insert into settlement_items (settlement_id, assignment_id, amount)
  select s.id, a.id, 1 from settlements s, assignments a where s.month = '2027-01-01' and s.payee_shop_id is null and a.job_id = '40000000-0000-0000-0000-000000018004'$$,
  '23505', null, '한 강습을 두 정산서에 넣을 수 없다 (고유 색인)');
select ok((select count(distinct month) from settlements where shop_id = '10000000-0000-0000-0000-000000018f01') = 2, '1월·2월만');

select * from finish();
rollback;
