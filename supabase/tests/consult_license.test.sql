-- P23-2 AI 상담 사용권 (pgTAP). 20261106015911_consult_license.sql
-- 권한(P21-11 쓰기 회수·열 권한·함수 실행 권한·search_path), 샵 격리(자기 사용권·팩만, admin_note 못 읽음, 다른 샵·강사·anon 0건),
-- 본사 RPC만 쓰기, 판정 consult_license_ok 모든 상태(대기 14일·한국 날짜 10일), 첫 자동응답 체험 시작 트리거,
-- 스위치 꺼짐 = 지금 동작 그대로 / 켜짐 = ai_gate no_license·monthly_quota·켜기 거부·인스타 연결 거부, 월 응답 건수(Q1)와 팩,
-- 하루 상한 유지, 정리 작업(대기 시작·중지·만료 알림·80%/100%), 자동 이행.
begin;
create extension if not exists pgtap with schema extensions;
select plan(83);

-- 시험 샵: shop1(하이원, 대표 a…11)·shop2(용평, a…12)·강습팀(a…13)은 시드. 아래 셋은 새로 만든다(멤버 없음)
insert into shops (id, type, name, status) values
  ('10000000-0000-0000-0000-000000023004', 'rental_shop', '[테스트] 사용권 없는 샵', 'approved'),
  ('10000000-0000-0000-0000-000000023005', 'rental_shop', '[테스트] 끝난 유료 샵', 'approved'),
  ('10000000-0000-0000-0000-000000023006', 'rental_shop', '[테스트] 이행 샵 A', 'approved'),
  ('10000000-0000-0000-0000-000000023007', 'rental_shop', '[테스트] 이행 샵 B', 'approved');

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
end $$;
-- 그 사람이 세 표에서 보는 행 수 (권한이 없으면 0)
create function pg_temp.seen(uid text) returns text[] language plpgsql as $$
declare t text; n bigint; out text[] := '{}';
begin
  foreach t in array array['consult_licenses', 'consult_usage_packs', 'consult_plans'] loop
    if uid is null then perform pg_temp.as_anon(); else perform pg_temp.as_user(uid); end if;
    begin execute format('select count(*) from %I', t) into n; exception when insufficient_privilege then n := 0; end;
    reset role;
    out := out || (t || ':' || n);
  end loop;
  return out;
end $$;
create function pg_temp.switch(on_ boolean) returns void language sql as $$
  update private.app_settings set value = to_jsonb(on_) where key = 'consult_license_required';
$$;
create function pg_temp.gate(s uuid) returns text language sql as $$
  select allowed::text || ':' || reason from ai_gate(s, 'consult');
$$;

create function pg_temp.next_month() returns text language sql as $$
  select to_char(date_trunc('month', now() at time zone 'Asia/Seoul') + interval '1 month', 'YYYY-MM');
$$;
create function pg_temp.set_quota(s uuid, inc int, cap int) returns void language plpgsql as $$
begin
  perform pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
  perform consult_admin_set_quota(s, inc, cap);
  reset role;
end $$;

-- (1) 권한 --------------------------------------------------------------------------------------------
select is(
  (select coalesce(array_agg(t || ':' || r || ':' || p order by t, r, p), '{}')
   from unnest(array['consult_plans', 'consult_licenses', 'consult_usage_packs']) t
   cross join unnest(array['anon', 'authenticated']) r
   cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
   where has_table_privilege(r, 'public.' || t, p)),
  '{}'::text[], 'anon·authenticated는 새 표 세 개에 쓰기 권한이 없다(P21-11)');
select is(
  (select coalesce(array_agg(t order by t), '{}') from unnest(array['consult_plans', 'consult_licenses', 'consult_usage_packs']) t
   where has_table_privilege('anon', 'public.' || t, 'SELECT')),
  '{}'::text[], 'anon은 새 표를 읽지 못한다');
select ok(not has_column_privilege('authenticated', 'public.consult_licenses', 'admin_note', 'SELECT')
          and has_column_privilege('authenticated', 'public.consult_licenses', 'status', 'SELECT'),
  'authenticated는 admin_note 열만 못 읽는다(열 권한)');
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('consult_license_check', 'consult_my_usage', 'consult_license_sweep', 'consult_admin_license_overview',
     'consult_admin_grant_license', 'consult_admin_set_paid', 'consult_admin_extend', 'consult_admin_suspend', 'consult_admin_add_pack',
     'consult_admin_set_quota', 'consult_admin_create_plan')
     and has_function_privilege('anon', p.oid, 'EXECUTE')),
  '{}'::text[], 'anon은 새 public 함수를 실행하지 못한다');
select ok(not has_function_privilege('authenticated', 'public.consult_license_check(uuid)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.consult_license_sweep()', 'EXECUTE')
          and has_function_privilege('service_role', 'public.consult_license_check(uuid)', 'EXECUTE')
          and has_function_privilege('service_role', 'public.consult_license_sweep()', 'EXECUTE'),
  '웹훅 확인·정리 작업은 서버(service_role) 전용');
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname like 'consult_%' and p.proname <> 'consult_metric_range_ok' and p.proname <> 'consult_seed_shop'
     and p.proname <> 'consult_seed_trigger' and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  '{}'::text[], '새 private 함수는 로그인 사용자가 직접 실행하지 못한다');
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and (p.proname like 'consult_license%' or p.proname like 'consult_admin_%' or p.proname like 'consult_kst_%'
          or p.proname in ('consult_month_used', 'consult_month_limit', 'consult_notify', 'consult_my_usage', 'consult_trial_start', 'ai_gate', 'set_consult_settings'))
     and not coalesce(array_to_string(p.proconfig, ',') ~ 'search_path=""', false)),
  '{}'::text[], '새·다시 정의한 함수는 search_path = '''' 로 고정');
select is((select value from private.app_settings where key = 'consult_license_required'), 'false'::jsonb, '켜짐 스위치는 기본 false');
select is((select count(*) from consult_plans where code = 'standard_v1' and included_monthly_responses = 2000 and overage_policy = 'block'
           and pack_size = 1000 and trial_days = 10 and trial_wait_days = 14 and expiry_notice_days = 3 and active), 1::bigint,
  '임시안 요금제 standard_v1 1행(2,000건·block·팩 1,000·체험 10일·대기 14일·알림 3일)');

-- (2) 본사 RPC만 쓴다 -----------------------------------------------------------------------------------
select pg_temp.as_user('a0000000-0000-0000-0000-000000000011'); -- shop1 대표
create function pg_temp.denied(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when insufficient_privilege then return true; end $$;
select is(
  (select count(*) filter (where pg_temp.denied(q)) from unnest(array[
    $q$select consult_admin_grant_license('b0000000-0000-0000-0000-000000000001')$q$,
    $q$select consult_admin_set_paid('b0000000-0000-0000-0000-000000000001', now(), now() + interval '30 days')$q$,
    $q$select consult_admin_extend('b0000000-0000-0000-0000-000000000001', now() + interval '30 days')$q$,
    $q$select consult_admin_suspend('b0000000-0000-0000-0000-000000000001', 'admin')$q$,
    $q$select consult_admin_add_pack('b0000000-0000-0000-0000-000000000001', to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM'), 1)$q$,
    $q$select consult_admin_set_quota('b0000000-0000-0000-0000-000000000001', 100000, null)$q$,
    $q$select consult_admin_create_plan('x_v1', 'x', 1, 1, 'block', 1, 1, 10, 14, 3)$q$,
    $q$select * from consult_admin_license_overview('2026-11')$q$
  ]) q), 8::bigint, '샵 관리자는 본사 RPC 8개를 모두 못 부른다(42501)');
select throws_ok($$ insert into consult_licenses (shop_id, plan_id, status, included_monthly_responses, overage_policy)
                    select 'b0000000-0000-0000-0000-000000000001', id, 'paid', 999999, 'allow' from consult_plans $$,
  '42501', null, '샵은 사용권을 직접 만들지 못한다');
reset role;

select pg_temp.as_user('a0000000-0000-0000-0000-000000000001'); -- 본사
select lives_ok($$ select consult_admin_grant_license('b0000000-0000-0000-0000-000000000001', p_note => '[테스트] 본사 메모 청구 12월') $$,
  '본사가 shop1에 체험 부여(첫 자동응답 기준)');
select throws_ok($$ select consult_admin_grant_license('b0000000-0000-0000-0000-000000000001') $$, '23505', null, '이미 있으면 다시 부여하지 못한다');
select lives_ok($$ select consult_admin_add_pack('b0000000-0000-0000-0000-000000000001', pg_temp.next_month(), 1) $$,
  '본사가 다음 달 팩 1개 추가');
select throws_ok($$ select consult_admin_add_pack('b0000000-0000-0000-0000-000000000001', '2020-01', 1) $$, '22023', null, '팩은 이번 달·다음 달만');
reset role;

-- (3) 샵 격리 ------------------------------------------------------------------------------------------
select is(pg_temp.seen('a0000000-0000-0000-0000-000000000011'), array['consult_licenses:1', 'consult_usage_packs:1', 'consult_plans:1'],
  'shop1 관리자는 자기 사용권·팩·요금제만 본다(대조군)');
select is(pg_temp.seen('a0000000-0000-0000-0000-000000000012'), array['consult_licenses:0', 'consult_usage_packs:0', 'consult_plans:0'], '다른 샵 관리자는 0건');
select is(pg_temp.seen('a0000000-0000-0000-0000-000000000013'), array['consult_licenses:0', 'consult_usage_packs:0', 'consult_plans:0'], '강습팀 관리자는 0건');
select is(pg_temp.seen('a0000000-0000-0000-0000-000000000021'), array['consult_licenses:0', 'consult_usage_packs:0', 'consult_plans:0'], '강사는 0건');
select is(pg_temp.seen(null), array['consult_licenses:0', 'consult_usage_packs:0', 'consult_plans:0'], 'anon은 0건');
select is(pg_temp.seen('a0000000-0000-0000-0000-000000000001'), array['consult_licenses:1', 'consult_usage_packs:1', 'consult_plans:1'], '본사는 전체를 본다');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000011');
select throws_ok($$ select admin_note from consult_licenses $$, '42501', null, '샵은 본사 메모(admin_note)를 못 읽는다');
select throws_ok($$ update consult_licenses set status = 'paid' $$, '42501', null, '샵은 사용권을 고치지 못한다');
select throws_ok($$ select consult_my_usage('b0000000-0000-0000-0000-000000000002') $$, '42501', null, '다른 샵 사용량은 못 본다');
reset role;
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
select is((select admin_note from consult_admin_license_overview(to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM')) where shop_id = 'b0000000-0000-0000-0000-000000000001'),
  '[테스트] 본사 메모 청구 12월', '본사 표에는 본사 메모가 있다');
reset role;
select is((select count(*) from audit_events where action = 'consult_license_granted' and shop_id = 'b0000000-0000-0000-0000-000000000001'
           and detail ->> 'start_mode' = 'first_auto_reply' and detail::text not like '%본사 메모%'), 1::bigint,
  '부여는 감사 기록에 남고, 본사 메모는 감사 기록에 넣지 않는다(샵 멤버도 읽는다)');
select is((select count(*) from notifications where kind = 'consult_license_granted' and user_id = 'a0000000-0000-0000-0000-000000000011'), 1::bigint,
  '부여하면 샵 대표에게 알림');

-- (4) 판정 consult_license_ok -------------------------------------------------------------------------
select is(private.consult_license_ok('10000000-0000-0000-0000-000000023004'), 'no_license', '사용권 없음 → no_license');
select is(private.consult_license_ok('b0000000-0000-0000-0000-000000000001'), 'ok', '부여 직후 체험 대기(첫 자동응답 전) → ok');
-- shop2: 대기 체험 (2026-11-01 10:00 KST 부여)
insert into consult_licenses (shop_id, plan_id, status, start_mode, granted_at, included_monthly_responses, overage_policy)
select 'b0000000-0000-0000-0000-000000000002', id, 'trial', 'first_auto_reply', '2026-11-01 10:00+09', 2000, 'block' from consult_plans where code = 'standard_v1';
select is(private.consult_license_ok('b0000000-0000-0000-0000-000000000002', '2026-11-15 09:59+09'), 'ok', '대기 14일 안 → ok');
select is((select w_starts::text || ' ~ ' || w_ends::text from private.consult_license_window('b0000000-0000-0000-0000-000000000002', '2026-11-15 10:00+09')),
  '2026-11-15 01:00:00+00 ~ 2026-11-24 15:00:00+00', '대기 14일이 지나면 시작 = 부여 + 14일, 끝 = 한국 날짜로 10일째 24시(11/25 0시 KST)');
select is(private.consult_license_ok('b0000000-0000-0000-0000-000000000002', '2026-11-24 23:59+09'), 'ok', '대기 뒤 체험 10일째 밤 → ok (정리 작업 전에도)');
select is(private.consult_license_ok('b0000000-0000-0000-0000-000000000002', '2026-11-25 00:00+09'), 'expired', '대기 뒤 체험 끝(11/25 0시 KST) → expired');
select is(array[private.consult_kst_day_end('2026-11-10 14:00+09', 10), private.consult_kst_day_end('2026-11-10 00:30+09', 10),
                private.consult_kst_day_end('2026-11-10 23:30+09', 10)],
  array['2026-11-20 00:00+09'::timestamptz, '2026-11-20 00:00+09', '2026-11-20 00:00+09'],
  '체험 10일은 한국 날짜 기준: 11/10 몇 시에 시작하든 11/20 0시 KST에 끝난다(UTC 날짜가 다른 0시 30분 포함)');
update consult_licenses set start_mode = 'fixed', starts_at = now() + interval '2 days', ends_at = now() + interval '12 days' where shop_id = 'b0000000-0000-0000-0000-000000000002';
select is(private.consult_license_ok('b0000000-0000-0000-0000-000000000002'), 'not_started', '지정 시작일 전 → not_started');
update consult_licenses set status = 'paid', starts_at = now() - interval '31 days', ends_at = now() - interval '1 second' where shop_id = 'b0000000-0000-0000-0000-000000000002';
select is(private.consult_license_ok('b0000000-0000-0000-0000-000000000002'), 'expired', '유료 종료 시각이 지나면 정리 작업 전이라도 → expired');
update consult_licenses set status = 'suspended', suspended_reason = 'unpaid', ends_at = now() + interval '10 days' where shop_id = 'b0000000-0000-0000-0000-000000000002';
select is(private.consult_license_ok('b0000000-0000-0000-0000-000000000002'), 'suspended', '중지 → suspended');

-- (5) 첫 자동응답에 체험 시작 (트리거) --------------------------------------------------------------------
insert into shop_channels (id, shop_id, channel, external_id, enabled) values
  ('d2300000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'kakao', 'bot-p23-1', true),
  ('d2300000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000003', 'kakao', 'bot-p23-3', true);
create temp table c1 as select * from consult_record_customer_message('d2300000-0000-0000-0000-000000000001', repeat('a', 64), null, 'p23-utt-1', '강습료 얼마예요?');
select consult_record_reply((select conversation_id from c1), 'ai', '[테스트] 초안', 'price', 0.9, 'v', 'skipped');
select consult_record_reply((select conversation_id from c1), 'system', '사장님께 전달했어요', 'unknown', 0, 'v', 'sent');
select is((select starts_at from consult_licenses where shop_id = 'b0000000-0000-0000-0000-000000000001'), null, '보내지 않은 AI 초안·안내 글로는 체험이 시작되지 않는다');
select consult_record_reply((select conversation_id from c1), 'ai', '[테스트] 1:1 2시간 120,000원', 'price', 0.95, 'v', 'sent');
select is((select array[starts_at, ends_at] from consult_licenses where shop_id = 'b0000000-0000-0000-0000-000000000001'),
  array[now(), private.consult_kst_day_end(now(), 10)], '첫 자동응답(ai·sent)이 나가면 체험 시작, 끝 = 한국 날짜 10일째 24시');
select consult_record_reply((select conversation_id from c1), 'ai', '[테스트] 두 번째 답', 'price', 0.95, 'v', 'sent');
select is((select count(*) from audit_events where action = 'consult_trial_started' and shop_id = 'b0000000-0000-0000-0000-000000000001'
           and detail ->> 'by' = 'first_auto_reply'), 1::bigint, '체험 시작은 한 번만 감사 기록에 남는다');
-- 강습팀: 20일 전 부여, 대기 14일이 지난 뒤 첫 자동응답 → 시작 = 부여 + 14일
insert into consult_licenses (shop_id, plan_id, status, start_mode, granted_at, included_monthly_responses, overage_policy)
select 'b0000000-0000-0000-0000-000000000003', id, 'trial', 'first_auto_reply', now() - interval '20 days', 10, 'block' from consult_plans where code = 'standard_v1';
create temp table c3 as select * from consult_record_customer_message('d2300000-0000-0000-0000-000000000003', repeat('b', 64), null, 'p23-utt-3', '영업시간?');
-- 발송 대기(pending)로 남긴 답이 나중에 sent로 바뀌어도 시작한다(update of delivery_status)
insert into messages (id, conversation_id, shop_id, channel, role, text, delivery_status)
select 'e2300000-0000-0000-0000-000000000003', conversation_id, 'b0000000-0000-0000-0000-000000000003', 'kakao', 'ai', '[테스트] 답', 'pending' from c3;
update messages set delivery_status = 'sent' where id = 'e2300000-0000-0000-0000-000000000003';
select is((select starts_at from consult_licenses where shop_id = 'b0000000-0000-0000-0000-000000000003'), now() - interval '6 days',
  '대기 14일이 지난 뒤 첫 자동응답이면 시작 = 부여 + 14일');
select is((select detail ->> 'by' from audit_events where action = 'consult_trial_started' and shop_id = 'b0000000-0000-0000-0000-000000000003'),
  'wait_elapsed', '그때 감사 기록은 by = wait_elapsed');

-- (6) 스위치 꺼짐 = 지금 동작 그대로 ----------------------------------------------------------------------
select is(pg_temp.gate('10000000-0000-0000-0000-000000023004'), 'true:ok', '꺼짐: 사용권 없는 샵도 ai_gate(consult) ok');
select is(pg_temp.gate('b0000000-0000-0000-0000-000000000002'), 'true:ok', '꺼짐: 중지된 샵도 ai_gate ok');
select is(consult_license_check('b0000000-0000-0000-0000-000000000002'), 'ok', '꺼짐: 웹훅 확인도 ok');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000012');
select lives_ok($$ select set_consult_settings('b0000000-0000-0000-0000-000000000002', true, null, null) $$, '꺼짐: 중지된 샵도 자동응답을 켤 수 있다');
reset role;
select lives_ok($$ select consult_connect_instagram('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000012',
                                                   '17841400000002302', 'v1.dG9rZW4=', now() + interval '50 days') $$,
  '꺼짐: 중지된 샵도 인스타를 연결할 수 있다');

-- (7) 스위치 켜짐 --------------------------------------------------------------------------------------
select pg_temp.switch(true);
select is(pg_temp.gate('10000000-0000-0000-0000-000000023004'), 'false:no_license', '켜짐: 사용권 없음 → no_license');
select is(pg_temp.gate('b0000000-0000-0000-0000-000000000002'), 'false:no_license', '켜짐: 중지 → no_license');
select is((select count(*) from ai_usage where shop_id in ('10000000-0000-0000-0000-000000023004', 'b0000000-0000-0000-0000-000000000002')), 0::bigint,
  '막힌 호출은 사용량을 남기지 않는다(AI 호출 0)');
select is(pg_temp.gate('b0000000-0000-0000-0000-000000000001'), 'true:ok', '켜짐: 사용 중인 체험 → ok');
select is((select allowed from ai_gate('10000000-0000-0000-0000-000000023004', 'intake')), true, '켜짐이어도 상담이 아닌 AI 기능은 그대로');
select is(consult_license_check('10000000-0000-0000-0000-000000023004'), 'no_license', '켜짐: 웹훅 확인 no_license');
-- 월 응답 건수(Q1): 이번 한국 달 consult 성공 호출만 센다
select pg_temp.set_quota('b0000000-0000-0000-0000-000000000001', 3, null);
insert into ai_usage (shop_id, feature, model, ok) values
  ('b0000000-0000-0000-0000-000000000001', 'consult', 'm', true), ('b0000000-0000-0000-0000-000000000001', 'consult', 'm', true),
  ('b0000000-0000-0000-0000-000000000001', 'consult', 'm', false), ('b0000000-0000-0000-0000-000000000001', 'consult', 'm', false),
  ('b0000000-0000-0000-0000-000000000001', 'intake', 'm', true), ('b0000000-0000-0000-0000-000000000002', 'consult', 'm', true);
insert into ai_usage (shop_id, feature, model, ok, created_at) values
  ('b0000000-0000-0000-0000-000000000001', 'consult', 'm', true, private.consult_kst_month_start(now()) - interval '1 minute');
select is(private.consult_month_used('b0000000-0000-0000-0000-000000000001'), 2,
  '응답 건수 = 이번 한국 달 consult 성공 행(실패·다른 기능·다른 샵·지난달 제외)');
select is(pg_temp.gate('b0000000-0000-0000-0000-000000000001'), 'true:ok', '2/3건 → ok');
insert into ai_usage (shop_id, feature, model, ok) values ('b0000000-0000-0000-0000-000000000001', 'consult', 'm', true);
select is(consult_license_check('b0000000-0000-0000-0000-000000000001'), 'monthly_quota', '3/3건 → 웹훅 확인 monthly_quota');
select is(pg_temp.gate('b0000000-0000-0000-0000-000000000001'), 'false:monthly_quota', '3/3건 → ai_gate monthly_quota');
select pg_temp.gate('b0000000-0000-0000-0000-000000000001');
select is((select count(*) from notifications where kind = 'consult_quota_reached' and payload ->> 'shop_id' = 'b0000000-0000-0000-0000-000000000001'),
  2::bigint, '처음 막힐 때 샵 대표·본사에 100% 알림 한 번씩(다시 막혀도 그대로)');
select is((select array_agg(user_id::text || ':' || coalesce(payload ->> 'admin', '-') order by user_id) from notifications
           where kind = 'consult_quota_reached' and payload ->> 'shop_id' = 'b0000000-0000-0000-0000-000000000001'),
  array['a0000000-0000-0000-0000-000000000001:true', 'a0000000-0000-0000-0000-000000000011:-'], '본사에게 간 알림에만 admin 표시(본사 화면으로 연결)');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
select consult_admin_add_pack('b0000000-0000-0000-0000-000000000001', to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM'), 1);
reset role;
select is(pg_temp.gate('b0000000-0000-0000-0000-000000000001'), 'true:ok', '이번 달 팩을 더하면 풀린다(한도 3 + 1,000)');
select pg_temp.set_quota('b0000000-0000-0000-0000-000000000001', 3, 4);
select is(pg_temp.gate('b0000000-0000-0000-0000-000000000001'), 'false:daily_cap', '하루 상한은 사용권과 별개로 남는다(daily_cap 4, 오늘 5행)');
select pg_temp.set_quota('b0000000-0000-0000-0000-000000000001', 3, null);
select pg_temp.as_user('a0000000-0000-0000-0000-000000000011');
select is((select array[(u ->> 'state'), (u ->> 'used'), (u ->> 'limit'), (u ->> 'required'), (u ->> 'status')] from consult_my_usage('b0000000-0000-0000-0000-000000000001') u),
  array['ok', '3', '1003', 'true', 'trial'], '샵 화면 사용량: 상태·이번 달 응답·한도(팩 포함)·스위치');
select is((select consult_my_usage('b0000000-0000-0000-0000-000000000001') ? 'monthly_price_krw'), false, '샵 화면 값에 가격은 없다(Q17)');
reset role;
-- 자동응답 켜기 거부·끄기 허용, 인스타 연결 거부
select pg_temp.as_user('a0000000-0000-0000-0000-000000000012');
select throws_ok($$ select set_consult_settings('b0000000-0000-0000-0000-000000000002', true, null, null) $$,
  '42501', 'AI 상담 사용권이 없어 켤 수 없습니다', '켜짐: 사용권 없이 자동응답 켜기 거부');
select lives_ok($$ select set_consult_settings('b0000000-0000-0000-0000-000000000002', false, null, null) $$, '켜짐: 끄기는 언제나 된다');
select lives_ok($$ select set_consult_settings('b0000000-0000-0000-0000-000000000002', null, '[테스트] 고지 문구', true) $$, '켜짐: 고지 문구 저장은 된다');
reset role;
select pg_temp.as_user('a0000000-0000-0000-0000-000000000011');
select lives_ok($$ select set_consult_settings('b0000000-0000-0000-0000-000000000001', true, null, null) $$, '켜짐: 사용권이 있으면 켤 수 있다');
reset role;
select throws_ok($$ select consult_connect_instagram('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000012',
                                                    '17841400000002303', 'v1.dG9rZW4=', now() + interval '50 days') $$,
  '42501', 'AI 상담 사용권이 없어 인스타그램을 연결할 수 없습니다', '켜짐: 사용권 없이 인스타 새 연결 거부');

-- (8) 매일 정리 작업 ----------------------------------------------------------------------------------
insert into consult_licenses (shop_id, plan_id, status, start_mode, starts_at, ends_at, included_monthly_responses, overage_policy)
select '10000000-0000-0000-0000-000000023005', id, 'paid', 'fixed', now() - interval '30 days', now() - interval '1 hour', 2000, 'block'
from consult_plans where code = 'standard_v1';
update shop_consult_settings set auto_reply_enabled = true where shop_id = '10000000-0000-0000-0000-000000023005';
insert into consult_licenses (shop_id, plan_id, status, start_mode, granted_at, included_monthly_responses, overage_policy)
select '10000000-0000-0000-0000-000000023004', id, 'trial', 'first_auto_reply', now() - interval '15 days', 2000, 'block' from consult_plans where code = 'standard_v1';
select pg_temp.switch(false);
select is(consult_license_sweep() ->> 'trial_started', '1', '꺼짐: 대기 14일이 지난 체험의 시작일은 채운다');
select is((select array[status, auto_reply_enabled::text] from consult_licenses l join shop_consult_settings s using (shop_id)
           where shop_id = '10000000-0000-0000-0000-000000023005'), array['paid', 'true'], '꺼짐: 끝난 사용권을 중지하지 않고 자동응답도 그대로');
select is((select array[starts_at, ends_at] from consult_licenses where shop_id = '10000000-0000-0000-0000-000000023004'),
  array[now() - interval '1 day', private.consult_kst_day_end(now() - interval '1 day', 10)], '채운 시작 = 부여 + 14일, 끝 = 한국 날짜 10일째 24시');
select is((select count(*) from audit_events where action = 'consult_trial_started' and shop_id = '10000000-0000-0000-0000-000000023004'
           and detail ->> 'by' = 'wait_elapsed'), 1::bigint, '대기로 시작한 체험은 by = wait_elapsed 감사 기록');
select pg_temp.switch(true);
-- 강습팀: 이틀 뒤 끝남(만료 알림), 포함 10건 중 8건 사용(80%)
update consult_licenses set ends_at = now() + interval '2 days' where shop_id = 'b0000000-0000-0000-0000-000000000003';
insert into ai_usage (shop_id, feature, model, ok) select 'b0000000-0000-0000-0000-000000000003', 'consult', 'm', true from generate_series(1, 8);
select is(consult_license_sweep() - 'trial_started',
  '{"required": true, "suspended": 1, "expiry_notices": 1, "quota_warnings": 1, "quota_reached": 0}'::jsonb, '켜짐: 중지 1·만료 알림 1·80% 알림 1');
select is((select array[status, suspended_reason, auto_reply_enabled::text] from consult_licenses l join shop_consult_settings s using (shop_id)
           where shop_id = '10000000-0000-0000-0000-000000023005'), array['suspended', 'expired', 'false'], '끝난 유료 사용권은 중지(expired)·자동응답 끔');
select is((select array_agg(action order by action) from audit_events where shop_id = '10000000-0000-0000-0000-000000023005'),
  array['consult_auto_reply_off', 'consult_license_suspended'], '중지·자동응답 끔은 감사 기록에(actor 없음)');
select is((select count(*) from notifications where kind = 'consult_license_expiring' and user_id = 'a0000000-0000-0000-0000-000000000013'), 1::bigint,
  '만료 3일 전 알림은 샵 대표에게');
select is((select count(*) from notifications where kind = 'consult_quota_warning' and payload ->> 'shop_id' = 'b0000000-0000-0000-0000-000000000003'), 2::bigint,
  '80% 알림은 샵 대표·본사에');
select is(consult_license_sweep() - 'trial_started', '{"required": true, "suspended": 0, "expiry_notices": 0, "quota_warnings": 0, "quota_reached": 0}'::jsonb,
  '다시 돌려도 같은 알림을 또 보내지 않는다');
-- 연장하면 다시 켜진다(자동응답은 사장님이 다시 켬, Q9)
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
select consult_admin_extend('10000000-0000-0000-0000-000000023005', now() + interval '30 days');
reset role;
select is((select array[status, coalesce(suspended_reason, '-'), private.consult_license_ok(shop_id), auto_reply_enabled::text]
           from consult_licenses join shop_consult_settings using (shop_id) where shop_id = '10000000-0000-0000-0000-000000023005'),
  array['paid', '-', 'ok', 'false'], '연장: 중지 → 유료로 다시 켜짐, 자동응답은 꺼진 채');

-- (9) 자동 이행 ----------------------------------------------------------------------------------------
select pg_temp.switch(false);
update shop_consult_settings set auto_reply_enabled = true where shop_id = '10000000-0000-0000-0000-000000023006';
insert into shop_channels (id, shop_id, channel, external_id, enabled) values
  ('d2300000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000023007', 'kakao', 'bot-p23-7', true);
create temp table c7 as select * from consult_record_customer_message('d2300000-0000-0000-0000-000000000007', repeat('c', 64), null, 'p23-utt-7', '가격?');
select consult_record_reply((select conversation_id from c7), 'ai', '[테스트] 답', 'price', 0.95, 'v', 'sent');
select is(private.consult_license_migrate(), 2, '자동 이행: 자동응답을 켠 샵·채널을 켠 샵에만 체험 부여');
select is((select array_agg(shop_id::text || ':' || coalesce((starts_at = now())::text, 'wait') order by shop_id) from consult_licenses
           where shop_id in ('10000000-0000-0000-0000-000000023006', '10000000-0000-0000-0000-000000023007')),
  array['10000000-0000-0000-0000-000000023006:wait', '10000000-0000-0000-0000-000000023007:true'],
  '자동응답이 아직 없으면 대기, 이미 나간 샵은 적용 시각에 시작');
select is((select count(*) from audit_events where action = 'consult_license_granted' and (detail ->> 'migration')::boolean), 2::bigint,
  '이행은 감사 기록 consult_license_granted {"migration": true}');
select is(private.consult_license_migrate(), 0, '다시 돌려도 더 넣지 않는다');

select * from finish();
rollback;
