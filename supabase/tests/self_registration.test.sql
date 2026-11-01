-- P13-3 손님 셀프 등록: 샵 링크 토큰 범위, 병합 확인 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000011101', 'sr-shop@t', '{"role":"shop_admin","name":"등록샵"}'),
  ('00000000-0000-0000-0000-000000011102', 'sr-other@t', '{"role":"shop_admin","name":"옆가게"}');
insert into shops (id, name, status) values
  ('10000000-0000-0000-0000-000000011101', '등록샵', 'approved'),
  ('10000000-0000-0000-0000-000000011102', '옆가게', 'approved');
insert into shop_members (shop_id, user_id, is_owner) values
  ('10000000-0000-0000-0000-000000011101', '00000000-0000-0000-0000-000000011101', true),
  ('10000000-0000-0000-0000-000000011102', '00000000-0000-0000-0000-000000011102', true);
insert into customers (id, shop_id, name, phone, level) values
  ('d0000000-0000-0000-0000-000000011101', '10000000-0000-0000-0000-000000011101', '기존손님', '010-6000-0001', '초급'),
  ('d0000000-0000-0000-0000-000000011102', '10000000-0000-0000-0000-000000011102', '옆가게손님', '010-6000-0009', '중급');

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.reg(tok text, nm text, ph text, by int default null, gn text default null, gp text default null, mk boolean default false)
returns void language sql as $$
  select public_register_customer(tok, nm, ph, by, '입문', '키 170', gn, gp, mk, false, 'qr', 'mv1', 'pv1')
$$;

select pg_temp.login('00000000-0000-0000-0000-000000011102');
select throws_ok($$select create_registration_link('10000000-0000-0000-0000-000000011101', '카운터', 30)$$, '42501', null, '다른 샵 링크는 만들 수 없다');

select pg_temp.login('00000000-0000-0000-0000-000000011101');
create temp table k as select create_registration_link('10000000-0000-0000-0000-000000011101', '카운터', 30) as token;
select ok(length((select token from k)) >= 32, '등록 링크 발급');
select is((select count(*)::int from registration_links where label = '카운터' and revoked_at is null), 1, '해시로 저장된 링크');
select throws_ok($$select create_registration_link('10000000-0000-0000-0000-000000011101', 'x', 400)$$, '22023', null, '유효 기간은 180일까지');
select throws_ok($$select public_register_customer('t', 'n', null, null, null, null, null, null, false, false, 'qr', 'm', 'p')$$, '42501', null, '로그인 사용자는 공개 함수를 부를 수 없다');

reset role;
select set_config('request.jwt.claims', '', true);
select is((select shop_name from public_registration_context((select token from k))), '등록샵', '링크로는 샵 이름만 본다');
select throws_ok($$select pg_temp.reg('엉뚱한토큰', '침입', '010-6000-0002')$$, '22023', null, '잘못된 토큰');

-- 새 손님
select lives_ok($$select pg_temp.reg((select token from k), '새손님', '010-6000-0003', null, null, null, true)$$, '새 손님 셀프 등록');
select is((select (shop_id, source, merge_candidate_id) from customers where name = '새손님'),
          ('10000000-0000-0000-0000-000000011101'::uuid, 'self'::text, null::uuid), '토큰의 샵에만 생기고, 출처는 셀프');
select is((select (subject, method, valid) from customer_consent_state s join customers c on c.id = s.customer_id where c.name = '새손님' and s.kind = 'marketing'),
          ('self'::text, 'qr'::text, true), '본인이 고른 동의는 유효');

-- 같은 연락처: 새 카드 + 병합 후보 표시 (기존 카드는 건드리지 않는다)
select lives_ok($$select pg_temp.reg((select token from k), '기존손님본인', '010-6000-0001')$$, '같은 연락처로 등록');
select is((select merge_candidate_id from customers where name = '기존손님본인'), 'd0000000-0000-0000-0000-000000011101'::uuid, '기존 카드가 병합 후보');
select is((select name from customers where id = 'd0000000-0000-0000-0000-000000011101'), '기존손님', '기존 카드는 그대로');
-- 다른 샵의 같은 번호와는 엮지 않는다
select lives_ok($$select pg_temp.reg((select token from k), '옆가게번호', '010-6000-0009')$$, '다른 샵 번호와 같은 연락처');
select is((select merge_candidate_id from customers where name = '옆가게번호'), null::uuid, '다른 샵 손님과는 병합 후보가 되지 않는다');

-- 14세 미만: 보호자 필수, QR에서 고른 동의는 보호자 확인 전이라 무효
select throws_ok(format($$select pg_temp.reg((select token from k), '꼬마', null, %s)$$, extract(year from now())::int - 8), '22023', null, '14세 미만은 보호자 필요');
select lives_ok(format($$select pg_temp.reg((select token from k), '꼬마', null, %s, '꼬마보호자', '010-6000-0004', true)$$, extract(year from now())::int - 8), '보호자와 함께 등록');
select is((select (subject, valid) from customer_consent_state s join customers c on c.id = s.customer_id where c.name = '꼬마' and s.kind = 'marketing'),
          ('guardian'::text, false), 'QR에서 한 14세 미만 동의는 보호자 링크 확인 전까지 무효');

-- 폐기한 링크는 못 쓴다
update registration_links set revoked_at = now();
select throws_ok($$select pg_temp.reg((select token from k), '늦은손님', '010-6000-0005')$$, '22023', null, '폐기된 링크');

-- 병합: 샵이 확인 후 기존 카드로 합친다
select pg_temp.login('00000000-0000-0000-0000-000000011101');
select lives_ok($$select merge_customers('d0000000-0000-0000-0000-000000011101', (select id from customers where name = '기존손님본인'))$$, '병합');
select is((select (name, level, equipment_size) from customers where id = 'd0000000-0000-0000-0000-000000011101'),
          ('기존손님'::text, '입문'::text, '키 170'::text), '이름은 두고 손님이 새로 입력한 값으로 갱신');
select is((select count(*)::int from customers where name = '기존손님본인'), 0, '중복 카드는 사라진다');

select * from finish();
rollback;
