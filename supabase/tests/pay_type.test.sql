-- P19-1 강사별 지급 방식 (pgTAP)
-- 기본 3.3% 불변 / none_by_shop은 원천세 0 / 비전속·다른 샵 변경 거부 / 이력 / 발행 뒤 소급 안 함
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000019a01', 'pt-a@t', '{"role":"instructor","name":"전속A"}'),
  ('00000000-0000-0000-0000-000000019b01', 'pt-b@t', '{"role":"instructor","name":"전속B"}'),
  ('00000000-0000-0000-0000-000000019c01', 'pt-c@t', '{"role":"instructor","name":"프리C"}'),
  ('00000000-0000-0000-0000-000000019f01', 'pt-s@t', '{"role":"shop_admin","name":"지급샵"}'),
  ('00000000-0000-0000-0000-000000019f03', 'pt-x@t', '{"role":"shop_admin","name":"남의샵"}');
insert into shops (id, type, name, status) values
  ('10000000-0000-0000-0000-000000019f01', 'rental_shop', '지급샵', 'approved'),
  ('10000000-0000-0000-0000-000000019f03', 'rental_shop', '남의샵', 'approved');
insert into shop_members (shop_id, user_id, is_owner) values
  ('10000000-0000-0000-0000-000000019f01', '00000000-0000-0000-0000-000000019f01', true),
  ('10000000-0000-0000-0000-000000019f03', '00000000-0000-0000-0000-000000019f03', true);
create function pg_temp.iid(u text) returns uuid language sql as $$ select id from instructors where user_id = u::uuid $$;
grant execute on function pg_temp.iid(text) to authenticated;
create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

insert into shop_instructors (shop_id, instructor_id) values
  ('10000000-0000-0000-0000-000000019f01', pg_temp.iid('00000000-0000-0000-0000-000000019a01')),
  ('10000000-0000-0000-0000-000000019f01', pg_temp.iid('00000000-0000-0000-0000-000000019b01'));

-- 1~2) 기본값: 기존·새 전속 모두 business_3_3, 값은 참조 표에서
select is((select array_agg(distinct pay_type) from shop_instructors), array['business_3_3'], '모든 전속의 기본 지급 방식은 3.3%');
select is((select array_agg(code order by sort) from pay_types), array['business_3_3', 'none_by_shop'], '지급 방식 값은 참조 표');

-- 2027년 1월: 전속 A 100,000 + 50,000, 전속 B 200,000, 프리랜서 C 33,330 (면제 경계)
insert into jobs (id, shop_id, starts_at, ends_at, status) values
  ('40000000-0000-0000-0000-000000019001', '10000000-0000-0000-0000-000000019f01', '2027-01-05 10:00+09', '2027-01-05 12:00+09', 'approved'),
  ('40000000-0000-0000-0000-000000019002', '10000000-0000-0000-0000-000000019f01', '2027-01-06 10:00+09', '2027-01-06 12:00+09', 'approved'),
  ('40000000-0000-0000-0000-000000019003', '10000000-0000-0000-0000-000000019f01', '2027-01-07 10:00+09', '2027-01-07 12:00+09', 'approved'),
  ('40000000-0000-0000-0000-000000019004', '10000000-0000-0000-0000-000000019f01', '2027-01-08 10:00+09', '2027-01-08 12:00+09', 'approved');
select set_config('app.system_write', 'on', true);
insert into assignments (job_id, instructor_id, final_rate, approved_at) values
  ('40000000-0000-0000-0000-000000019001', pg_temp.iid('00000000-0000-0000-0000-000000019a01'), 100000, now()),
  ('40000000-0000-0000-0000-000000019002', pg_temp.iid('00000000-0000-0000-0000-000000019a01'), 50000, now()),
  ('40000000-0000-0000-0000-000000019003', pg_temp.iid('00000000-0000-0000-0000-000000019b01'), 200000, now()),
  ('40000000-0000-0000-0000-000000019004', pg_temp.iid('00000000-0000-0000-0000-000000019c01'), 33330, now());
select set_config('app.system_write', 'off', true);

-- 3) 회귀: 아무것도 바꾸지 않으면 현행 3.3%와 같다
select pg_temp.login('00000000-0000-0000-0000-000000019f01');
select generate_settlements('10000000-0000-0000-0000-000000019f01', '2027-01-01');
select is(
  (select string_agg(p.name || ':' || s.gross || '/' || s.withholding || '/' || s.net || '/' || s.pay_type, ',' order by p.name)
   from settlements s join instructors i on i.id = s.instructor_id join profiles p on p.id = i.user_id
   where s.shop_id = '10000000-0000-0000-0000-000000019f01'),
  '전속A:150000/4950/145050/business_3_3,전속B:200000/6600/193400/business_3_3,프리C:33330/0/33330/business_3_3',
  '기본값이면 기존 3.3% 금액 그대로 (프리랜서 33,330원은 소액부징수)');

-- 4~8) 변경 권한
select throws_ok($$select set_instructor_pay_type('10000000-0000-0000-0000-000000019f01', pg_temp.iid('00000000-0000-0000-0000-000000019c01'), 'none_by_shop')$$,
  '22023', '전속 강사만 지급 방식을 바꿀 수 있습니다', '프리랜서(비전속)는 바꿀 수 없다');
select throws_ok($$select set_instructor_pay_type('10000000-0000-0000-0000-000000019f01', pg_temp.iid('00000000-0000-0000-0000-000000019b01'), 'labor_income')$$,
  '22023', null, '없는 지급 방식은 거부');
update shop_instructors set pay_type = 'none_by_shop' where shop_id = '10000000-0000-0000-0000-000000019f01';
select is((select count(*) from shop_instructors where pay_type <> 'business_3_3'), 0::bigint, '표 직접 수정으로는 못 바꾼다');
select pg_temp.login('00000000-0000-0000-0000-000000019f03');
select throws_ok($$select set_instructor_pay_type('10000000-0000-0000-0000-000000019f01', pg_temp.iid('00000000-0000-0000-0000-000000019b01'), 'none_by_shop')$$,
  '42501', null, '다른 샵은 바꿀 수 없다');
select pg_temp.login('00000000-0000-0000-0000-000000019b01');
select throws_ok($$select set_instructor_pay_type('10000000-0000-0000-0000-000000019f01', pg_temp.iid('00000000-0000-0000-0000-000000019b01'), 'none_by_shop')$$,
  '42501', null, '강사 본인도 바꿀 수 없다');

-- 9~11) 샵이 전속 B만 none_by_shop으로 → 이력 → 다시 집계하면 B 원천세 0
select pg_temp.login('00000000-0000-0000-0000-000000019f01');
select lives_ok($$select set_instructor_pay_type('10000000-0000-0000-0000-000000019f01', pg_temp.iid('00000000-0000-0000-0000-000000019b01'), 'none_by_shop')$$, '샵 관리자는 바꿀 수 있다');
select is(
  (select old_pay_type || '>' || new_pay_type || ':' || (changed_by = '00000000-0000-0000-0000-000000019f01')::text from shop_instructor_pay_type_log),
  'business_3_3>none_by_shop:true', '이력: 이전 값·새 값·바꾼 사람');
select generate_settlements('10000000-0000-0000-0000-000000019f01', '2027-01-01');
select is(
  (select string_agg(p.name || ':' || s.gross || '/' || s.withholding || '/' || s.net || '/' || s.pay_type, ',' order by p.name)
   from settlements s join instructors i on i.id = s.instructor_id join profiles p on p.id = i.user_id
   where s.shop_id = '10000000-0000-0000-0000-000000019f01'),
  '전속A:150000/4950/145050/business_3_3,전속B:200000/0/200000/none_by_shop,프리C:33330/0/33330/business_3_3',
  '전속 2명 중 B만 샵 별도 처리: B 원천세 0, A는 3.3%');

-- 12~13) 발행 뒤 바꿔도 발행된 정산서는 그대로
select issue_settlements('10000000-0000-0000-0000-000000019f01', '2027-01-01');
select set_instructor_pay_type('10000000-0000-0000-0000-000000019f01', pg_temp.iid('00000000-0000-0000-0000-000000019b01'), 'business_3_3');
select generate_settlements('10000000-0000-0000-0000-000000019f01', '2027-01-01');
select is(
  (select s.withholding || '/' || s.pay_type from settlements s where s.instructor_id = pg_temp.iid('00000000-0000-0000-0000-000000019b01')),
  '0/none_by_shop', '발행된 정산서에는 소급하지 않는다(발행 시점 값 보존)');
select is((select count(*) from shop_instructor_pay_type_log), 2::bigint, '되돌린 것도 이력에 남는다');

-- 14) 이력은 샵 멤버만 읽고 직접 못 쓴다
select throws_ok($$insert into shop_instructor_pay_type_log (shop_id, instructor_id, old_pay_type, new_pay_type) values ('10000000-0000-0000-0000-000000019f01', pg_temp.iid('00000000-0000-0000-0000-000000019a01'), 'business_3_3', 'none_by_shop')$$,
  '42501', null, '이력은 직접 쓸 수 없다');
select pg_temp.login('00000000-0000-0000-0000-000000019f03');
select is((select count(*) from shop_instructor_pay_type_log), 0::bigint, '다른 샵은 이력을 못 본다');

-- 16) 같은 값으로 바꾸면 이력을 늘리지 않는다
select pg_temp.login('00000000-0000-0000-0000-000000019f01');
select set_instructor_pay_type('10000000-0000-0000-0000-000000019f01', pg_temp.iid('00000000-0000-0000-0000-000000019a01'), 'business_3_3');
select is((select count(*) from shop_instructor_pay_type_log), 2::bigint, '같은 값이면 이력 없음');

-- 17) 강사는 자기 전속 지급 방식을 볼 수 있다 (정산 예상치)
select pg_temp.login('00000000-0000-0000-0000-000000019a01');
select is((select pay_type from shop_instructors), 'business_3_3', '강사는 자기 지급 방식을 본다');

-- 18) anon은 실행 불가
reset role;
select ok(not has_function_privilege('anon', 'public.set_instructor_pay_type(uuid, uuid, text)', 'execute'), 'anon은 실행 불가');

select * from finish();
rollback;
