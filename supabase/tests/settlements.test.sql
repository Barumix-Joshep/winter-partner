-- P6-1 월 정산 집계 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000ffa01', 'st-a@t', '{"role":"instructor","name":"정산A"}'),
  ('00000000-0000-0000-0000-0000000ffb01', 'st-b@t', '{"role":"instructor","name":"정산B"}'),
  ('00000000-0000-0000-0000-0000000fff01', 'st-s@t', '{"role":"shop_admin","name":"정산샵"}'),
  ('00000000-0000-0000-0000-0000000fff02', 'st-s2@t', '{"role":"shop_admin","name":"옆정산샵"}');
insert into shops (id, type, name, status) values
  ('10000000-0000-0000-0000-0000000fff01', 'rental_shop', '정산샵', 'approved'),
  ('10000000-0000-0000-0000-0000000fff02', 'lesson_team', '정산팀', 'approved');
insert into shop_members (shop_id, user_id, is_owner) values
  ('10000000-0000-0000-0000-0000000fff01', '00000000-0000-0000-0000-0000000fff01', true),
  ('10000000-0000-0000-0000-0000000fff02', '00000000-0000-0000-0000-0000000fff02', true);
create function pg_temp.iid(u text) returns uuid language sql as $$ select id from instructors where user_id = u::uuid $$;
grant execute on function pg_temp.iid(text) to authenticated;

-- 2027년 1월 (KST): A 승인 2건, B 승인 1건, 팀 승인 1건 / 제외: A 완료 보고만, A 취소, 2월 강습, 1/31 23시 이후는 2월 아님(1월)
insert into jobs (id, shop_id, starts_at, ends_at, status) values
  ('40000000-0000-0000-0000-0000000ff001', '10000000-0000-0000-0000-0000000fff01', '2027-01-01 00:30+09', '2027-01-01 02:00+09', 'approved'),
  ('40000000-0000-0000-0000-0000000ff002', '10000000-0000-0000-0000-0000000fff01', '2027-01-31 23:00+09', '2027-02-01 01:00+09', 'approved'),
  ('40000000-0000-0000-0000-0000000ff003', '10000000-0000-0000-0000-0000000fff01', '2027-01-10 10:00+09', '2027-01-10 12:00+09', 'approved'),
  ('40000000-0000-0000-0000-0000000ff004', '10000000-0000-0000-0000-0000000fff01', '2027-01-11 10:00+09', '2027-01-11 12:00+09', 'approved'),
  ('40000000-0000-0000-0000-0000000ff005', '10000000-0000-0000-0000-0000000fff01', '2027-01-12 10:00+09', '2027-01-12 12:00+09', 'done'),
  ('40000000-0000-0000-0000-0000000ff006', '10000000-0000-0000-0000-0000000fff01', '2027-01-13 10:00+09', '2027-01-13 12:00+09', 'canceled'),
  ('40000000-0000-0000-0000-0000000ff007', '10000000-0000-0000-0000-0000000fff01', '2027-02-01 10:00+09', '2027-02-01 12:00+09', 'approved');
insert into assignments (job_id, instructor_id, via_shop_id, final_rate, approved_at) values
  ('40000000-0000-0000-0000-0000000ff001', pg_temp.iid('00000000-0000-0000-0000-0000000ffa01'), null, 100000, now()),
  ('40000000-0000-0000-0000-0000000ff002', pg_temp.iid('00000000-0000-0000-0000-0000000ffa01'), null, 130000, now()),
  ('40000000-0000-0000-0000-0000000ff003', pg_temp.iid('00000000-0000-0000-0000-0000000ffb01'), null, 30000, now()),
  ('40000000-0000-0000-0000-0000000ff004', null, '10000000-0000-0000-0000-0000000fff02', 500000, now()),
  ('40000000-0000-0000-0000-0000000ff005', pg_temp.iid('00000000-0000-0000-0000-0000000ffa01'), null, 80000, null),
  ('40000000-0000-0000-0000-0000000ff007', pg_temp.iid('00000000-0000-0000-0000-0000000ffa01'), null, 80000, now());
-- 취소 강습(ff006)은 배정이 남아 있어도 제외되어야 한다 (2월 강습과 겹치지 않게 별도 강사 없이)
insert into assignments (job_id, instructor_id, final_rate, approved_at) values ('40000000-0000-0000-0000-0000000ff006', pg_temp.iid('00000000-0000-0000-0000-0000000ffb01'), 99999, now());

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

select pg_temp.login('00000000-0000-0000-0000-0000000fff02');
select throws_ok($$select generate_settlements('10000000-0000-0000-0000-0000000fff01', '2027-01-01')$$, '42501', null, '다른 샵 정산은 만들 수 없다');

select pg_temp.login('00000000-0000-0000-0000-0000000fff01');
select is((select generate_settlements('10000000-0000-0000-0000-0000000fff01', '2027-01-15')), 3, '한 달 지급 대상 3곳 (강사 2·팀 1)');
select is((select gross || '/' || withholding || '/' || net from settlements where instructor_id = pg_temp.iid('00000000-0000-0000-0000-0000000ffa01')),
  '230000/7590/222410', 'A: 승인 2건 합계와 3.3% (한국 시간 월 경계)');
select is((select count(*) from settlement_items i join settlements s on s.id = i.settlement_id where s.instructor_id = pg_temp.iid('00000000-0000-0000-0000-0000000ffa01')),
  2::bigint, '항목 2건 (완료 보고만 된 강습, 다음 달 강습 제외)');
select is((select gross || '/' || withholding from settlements where instructor_id = pg_temp.iid('00000000-0000-0000-0000-0000000ffb01')),
  '30000/0', 'B: 소득세 1,000원 미만은 징수하지 않는다, 취소 강습 제외');
select is((select gross || '/' || withholding || '/' || net from settlements where payee_shop_id = '10000000-0000-0000-0000-0000000fff02'),
  '500000/0/500000', '팀 지급은 원천세 없음');
select is((select month from settlements limit 1), '2027-01-01'::date, '월은 1일로 저장');

-- 다시 집계해도 중복되지 않고, 발행된 정산서는 그대로
select is((select generate_settlements('10000000-0000-0000-0000-0000000fff01', '2027-01-01')), 3, '다시 집계');
select is((select count(*) from settlements), 3::bigint, '중복 없음');
select set_config('role', 'postgres', true); -- 발행은 샵 화면에서 issue_settlements로. 여기서는 A 한 장만 발행한 상태를 만든다
update settlements set status = 'issued' where instructor_id = pg_temp.iid('00000000-0000-0000-0000-0000000ffa01');
update assignments set final_rate = 150000 where job_id = '40000000-0000-0000-0000-0000000ff001';
select pg_temp.login('00000000-0000-0000-0000-0000000fff01');
select generate_settlements('10000000-0000-0000-0000-0000000fff01', '2027-01-01');
select is((select gross from settlements where instructor_id = pg_temp.iid('00000000-0000-0000-0000-0000000ffa01')), 230000, '발행된 정산서는 다시 집계해도 바뀌지 않는다');

-- 강사는 자기 정산만
select pg_temp.login('00000000-0000-0000-0000-0000000ffb01');
select is((select count(*) from settlements), 1::bigint, '강사는 자기 정산서만 본다');
select is((select count(*) from settlement_items), 1::bigint, '자기 항목만');
select throws_ok($$select generate_settlements('10000000-0000-0000-0000-0000000fff01', '2027-01-01')$$, '42501', null, '강사는 집계할 수 없다');
-- 팀은 받는 쪽으로 본다
select pg_temp.login('00000000-0000-0000-0000-0000000fff02');
select is((select count(*) from settlements), 1::bigint, '팀은 받을 정산서를 본다');

select * from finish();
rollback;
