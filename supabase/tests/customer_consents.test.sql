-- P13-1 손님 선택 동의 기록 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000eee01', 'cs-shop@t', '{"role":"shop_admin","name":"동의샵"}'),
  ('00000000-0000-0000-0000-0000000eee02', 'cs-other@t', '{"role":"shop_admin","name":"남샵"}'),
  ('00000000-0000-0000-0000-0000000eee03', 'cs-inst@t', '{"role":"instructor","name":"동의강사"}');
insert into shops (id, name, status) values
  ('10000000-0000-0000-0000-0000000eee01', '동의샵', 'approved'),
  ('10000000-0000-0000-0000-0000000eee02', '남샵', 'approved');
insert into shop_members (shop_id, user_id, is_owner) values
  ('10000000-0000-0000-0000-0000000eee01', '00000000-0000-0000-0000-0000000eee01', true),
  ('10000000-0000-0000-0000-0000000eee02', '00000000-0000-0000-0000-0000000eee02', true);
insert into customers (id, shop_id, name, phone) values
  ('d0000000-0000-0000-0000-0000000eee01', '10000000-0000-0000-0000-0000000eee01', '본인동의', '010-3000-0001'),
  ('d0000000-0000-0000-0000-0000000eee02', '10000000-0000-0000-0000-0000000eee01', '직원기록', '010-3000-0002'),
  ('d0000000-0000-0000-0000-0000000eee03', '10000000-0000-0000-0000-0000000eee01', '오래된동의', '010-3000-0003');

-- 시스템(공개 페이지·셀프 등록)이 남기는 본인 동의, 3년 전 본인 동의
insert into customer_consents (shop_id, customer_id, kind, granted, subject, method, text_version, created_at) values
  ('10000000-0000-0000-0000-0000000eee01', 'd0000000-0000-0000-0000-0000000eee01', 'marketing', true, 'self', 'qr', 'v1', now()),
  ('10000000-0000-0000-0000-0000000eee01', 'd0000000-0000-0000-0000-0000000eee03', 'marketing', true, 'self', 'link', 'v1', now() - interval '3 years');

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

select pg_temp.login('00000000-0000-0000-0000-0000000eee01');
select lives_ok($$select record_staff_consent('d0000000-0000-0000-0000-0000000eee02', 'marketing', true)$$, '직원 기록');
select is((select subject from customer_consents where customer_id = 'd0000000-0000-0000-0000-0000000eee02'), 'staff', '주체 = 직원 기록');
select is((select method from customer_consents where customer_id = 'd0000000-0000-0000-0000-0000000eee02'), 'onsite', '방법 = 현장');
select throws_ok($$insert into customer_consents (shop_id, customer_id, kind, granted, subject, method, text_version)
  values ('10000000-0000-0000-0000-0000000eee01', 'd0000000-0000-0000-0000-0000000eee02', 'marketing', true, 'self', 'onsite', 'v1')$$,
  '42501', null, '샵이 본인 동의를 직접 넣을 수 없다');
delete from customer_consents;  -- 샵 멤버의 삭제는 RLS로 0건
reset role;
select is((select count(*)::int from customer_consents), 3, '동의 기록은 지울 수 없다 (RLS)');
select throws_ok($$update customer_consents set granted = false$$, '42501', null, '동의 기록은 관리자도 고칠 수 없다 (트리거)');
select pg_temp.login('00000000-0000-0000-0000-0000000eee01');

select is((select valid from customer_consent_state where customer_id = 'd0000000-0000-0000-0000-0000000eee01' and kind = 'marketing'), true, '본인 동의는 유효');
select is((select valid from customer_consent_state where customer_id = 'd0000000-0000-0000-0000-0000000eee02' and kind = 'marketing'), false, '직원 기록은 무효');
select is((select (valid, needs_recheck) from customer_consent_state where customer_id = 'd0000000-0000-0000-0000-0000000eee03' and kind = 'marketing'),
          (false, true), '2년 지난 동의는 재확인 필요, 발송 제외');
select is((select array_agg(customer_id) from marketing_recipients('10000000-0000-0000-0000-0000000eee01')),
          array['d0000000-0000-0000-0000-0000000eee01'::uuid], '발송 대상은 유효한 본인 동의만');

-- 철회는 직원도 기록할 수 있고, 최신 기록이 상태가 된다
select lives_ok($$select record_staff_consent('d0000000-0000-0000-0000-0000000eee01', 'marketing', false)$$, '철회 기록');
select is((select (granted, valid) from customer_consent_state where customer_id = 'd0000000-0000-0000-0000-0000000eee01' and kind = 'marketing'),
          (false, false), '최신 기록이 철회면 무효');
select is((select count(*)::int from marketing_recipients('10000000-0000-0000-0000-0000000eee01')), 0, '철회 후 발송 대상 없음');

select pg_temp.login('00000000-0000-0000-0000-0000000eee02');
select is((select count(*)::int from customer_consents), 0, '다른 샵은 동의 기록을 못 본다');
select throws_ok($$select record_staff_consent('d0000000-0000-0000-0000-0000000eee02', 'marketing', true)$$, '42501', null, '다른 샵 손님에 기록 불가');
select pg_temp.login('00000000-0000-0000-0000-0000000eee03');
select is((select count(*)::int from customer_consent_state), 0, '강사는 동의 상태를 못 본다');

select throws_ok($$select * from private.app_settings$$, '42501', null, '설정 테이블은 로그인 사용자가 읽을 수 없다');
select is(private.setting_int('consent_recheck_years'), 2, '설정값은 함수로 읽힌다');

select * from finish();
rollback;
