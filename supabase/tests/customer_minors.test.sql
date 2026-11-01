-- P13-2 14세 미만 손님: 보호자 필수, 선택 동의는 보호자 본인 동의만 유효, 동의 링크 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000fff01', 'mn-shop@t', '{"role":"shop_admin","name":"어린이샵"}'),
  ('00000000-0000-0000-0000-0000000fff02', 'mn-other@t', '{"role":"shop_admin","name":"옆샵"}');
insert into shops (id, name, status) values
  ('10000000-0000-0000-0000-0000000fff01', '어린이샵', 'approved'),
  ('10000000-0000-0000-0000-0000000fff02', '옆샵', 'approved');
insert into shop_members (shop_id, user_id, is_owner) values
  ('10000000-0000-0000-0000-0000000fff01', '00000000-0000-0000-0000-0000000fff01', true),
  ('10000000-0000-0000-0000-0000000fff02', '00000000-0000-0000-0000-0000000fff02', true);

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.this_year() returns int language sql as $$ select extract(year from now() at time zone 'Asia/Seoul')::int $$;

select ok(private.is_minor(pg_temp.this_year() - 10), '10살은 14세 미만');
select ok(private.is_minor(pg_temp.this_year() - 14), '연도로 14살이면 생일 전일 수 있어 14세 미만으로 본다');
select ok(not private.is_minor(pg_temp.this_year() - 15), '15살은 아님');
select ok(not private.is_minor(null), '출생 연도가 없으면 판단하지 않는다');

select pg_temp.login('00000000-0000-0000-0000-0000000fff01');
select throws_ok(format($$insert into customers (shop_id, name, birth_year) values ('10000000-0000-0000-0000-0000000fff01', '아이', %s)$$, pg_temp.this_year() - 9),
  '22023', null, '14세 미만은 보호자 이름·연락처가 필요하다');
select lives_ok(format($$insert into customers (id, shop_id, name, birth_year, guardian_name, guardian_phone)
  values ('d0000000-0000-0000-0000-0000000fff01', '10000000-0000-0000-0000-0000000fff01', '아이', %s, '보호자', '010-4000-0001')$$, pg_temp.this_year() - 9),
  '보호자가 있으면 등록');

-- 동의 링크: 샵이 만들고, 원문 토큰은 한 번만 돌려준다 (DB에는 해시만)
select ok(length(create_consent_link('d0000000-0000-0000-0000-0000000fff01')) >= 32, '링크 토큰 발급');
select is((select count(*)::int from consent_links where token_hash is not null and customer_id = 'd0000000-0000-0000-0000-0000000fff01'), 1, '해시로 저장');
select pg_temp.login('00000000-0000-0000-0000-0000000fff02');
select throws_ok($$select create_consent_link('d0000000-0000-0000-0000-0000000fff01')$$, '42501', null, '다른 샵 손님 링크는 만들 수 없다');
select is((select count(*)::int from consent_links), 0, '다른 샵은 링크를 못 본다');

-- 공개 페이지 함수는 로그인 사용자도 못 부른다 (서버가 service_role로만)
select pg_temp.login('00000000-0000-0000-0000-0000000fff01');
select throws_ok($$select public_consent_context('x')$$, '42501', null, '공개 함수는 authenticated가 부를 수 없다');
reset role;
select set_config('request.jwt.claims', '', true);

-- 직접 링크 토큰을 만들어 공개 함수 확인 (service_role 대신 postgres)
create temp table t as select private.create_consent_link_internal('d0000000-0000-0000-0000-0000000fff01', null) as token;
select is((select (shop_name, is_minor) from public_consent_context((select token from t))), ('어린이샵'::text, true), '링크로는 샵 이름과 14세 미만 여부만 본다');
select throws_ok($$select public_submit_consent('없는토큰', true, false, 'link', 'mv1', 'pv1')$$, '22023', null, '잘못된 토큰');
select lives_ok($$select public_submit_consent((select token from t), true, true, 'link', 'mv1', 'pv1')$$, '보호자가 링크에서 동의');
select is((select (subject, method, valid) from customer_consent_state where customer_id = 'd0000000-0000-0000-0000-0000000fff01' and kind = 'marketing'),
          ('guardian'::text, 'link'::text, true), '14세 미만은 보호자 동의로 기록되고 유효');
select throws_ok($$select public_submit_consent((select token from t), false, false, 'link', 'mv1', 'pv1')$$, '22023', null, '링크는 한 번만 쓴다');

-- 14세 미만인데 본인(self) 기록이면 무효
insert into customer_consents (shop_id, customer_id, kind, granted, subject, method, text_version)
values ('10000000-0000-0000-0000-0000000fff01', 'd0000000-0000-0000-0000-0000000fff01', 'photo', true, 'self', 'qr', 'v1');
select is((select valid from customer_consent_state where customer_id = 'd0000000-0000-0000-0000-0000000fff01' and kind = 'photo'), false,
          '14세 미만 본인 동의는 무효 (보호자 확인 필요)');

-- 요청 제한
select is((select bool_and(public_rate_limit('test-key', 3, 600)) from generate_series(1, 3)), true, '창 안에서 3번까지 허용');
select is(public_rate_limit('test-key', 3, 600), false, '4번째는 막는다');
select is(public_rate_limit('other-key', 3, 600), true, '키가 다르면 따로 센다');

select * from finish();
rollback;
