-- P22-7 AI 상담 본사 지표: 본사만 숫자 집계를 받고(샵 관리자·강사·anon 거부), 돌려주는 열에 글자가 없다.
-- 2026년 1월(한국 시간) 고정 데이터로 자동응답률·에스컬레이션·첫 응답 시간·피드백·샵별 비용을 맞춘다 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

insert into shop_channels (id, shop_id, channel, external_id, enabled) values
  ('d2270000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'kakao', 'bot-metrics', true);
insert into conversations (id, shop_id, channel, channel_id, external_user_hash) values
  ('d2270000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-000000000001', 'kakao', 'd2270000-0000-0000-0000-000000000001', repeat('a', 64)),
  ('d2270000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000001', 'kakao', 'd2270000-0000-0000-0000-000000000001', repeat('b', 64)),
  ('d2270000-0000-0000-0000-00000000000c', 'b0000000-0000-0000-0000-000000000001', 'kakao', 'd2270000-0000-0000-0000-000000000001', repeat('c', 64)),
  ('d2270000-0000-0000-0000-00000000000d', 'b0000000-0000-0000-0000-000000000001', 'kakao', 'd2270000-0000-0000-0000-000000000001', repeat('d', 64)),
  ('d2270000-0000-0000-0000-00000000000e', 'b0000000-0000-0000-0000-000000000001', 'kakao', 'd2270000-0000-0000-0000-000000000001', repeat('e', 64));

create function pg_temp.msg(conv text, role text, at text, delivery text, id text default null) returns void language sql as $$
  insert into messages (id, conversation_id, shop_id, channel, role, text, sent_at, delivery_status)
  values (coalesce(id::uuid, gen_random_uuid()), ('d2270000-0000-0000-0000-00000000000' || conv)::uuid,
          'b0000000-0000-0000-0000-000000000001', 'kakao', role, '[테스트] 지표 메시지', (at || '+09')::timestamptz, delivery)
$$;
-- A: 자동응답 1번(30초) → 사장님 연결 안내(system) → 사장님 답장(카카오는 skipped). 기간 앞 손님 메시지는 세지 않는다
select pg_temp.msg('a', 'customer', '2025-12-31 23:59:59', 'skipped');
select pg_temp.msg('a', 'customer', '2026-01-10 10:00:00', 'skipped');
select pg_temp.msg('a', 'ai', '2026-01-10 10:00:30', 'sent', 'd2270000-0000-0000-0000-0000000000a1');
select pg_temp.msg('a', 'customer', '2026-01-10 10:05:00', 'skipped');
select pg_temp.msg('a', 'system', '2026-01-10 10:05:10', 'sent');
select pg_temp.msg('a', 'owner', '2026-01-10 10:15:00', 'skipped');
-- B: AI 답을 못 보냄(skipped) → 사장님이 2분 뒤 답장. 기간 마지막 순간 손님 메시지의 자동응답은 다음 달에 나가도 센다
select pg_temp.msg('b', 'customer', '2026-01-20 09:00:00', 'skipped');
select pg_temp.msg('b', 'ai', '2026-01-20 09:00:05', 'skipped');
select pg_temp.msg('b', 'owner', '2026-01-20 09:02:00', 'sent');
select pg_temp.msg('b', 'customer', '2026-01-31 23:59:59', 'skipped');
select pg_temp.msg('b', 'ai', '2026-02-01 00:00:10', 'sent');
-- C: 다음 달 0시 정각 손님 메시지 → 기간 밖
select pg_temp.msg('c', 'customer', '2026-02-01 00:00:00', 'skipped');
-- D: 보내지 못한 사장님 답장(failed)은 응답이 아니다 → 10분 뒤 답장
select pg_temp.msg('d', 'customer', '2026-01-25 12:00:00', 'skipped');
select pg_temp.msg('d', 'owner', '2026-01-25 12:01:00', 'failed');
select pg_temp.msg('d', 'owner', '2026-01-25 12:10:00', 'sent');
-- E: 응답 없음
select pg_temp.msg('e', 'customer', '2026-01-26 08:00:00', 'skipped');

insert into inquiries (shop_id, channel, conversation_id, type, created_at) values
  ('b0000000-0000-0000-0000-000000000001', 'kakao', 'd2270000-0000-0000-0000-00000000000a', 'booking', '2026-01-10 10:05:10+09'),
  ('b0000000-0000-0000-0000-000000000001', 'kakao', 'd2270000-0000-0000-0000-00000000000a', 'other', '2026-01-10 11:00:00+09'),
  ('b0000000-0000-0000-0000-000000000001', 'kakao', 'd2270000-0000-0000-0000-00000000000c', 'other', '2026-02-01 00:00:01+09');
insert into ai_feedback (message_id, shop_id, kind, created_at) values
  ('d2270000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-000000000001', 'wrong', '2026-01-11 09:00+09'),
  ('d2270000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-000000000001', 'edited', '2026-01-12 09:00+09'),
  ('d2270000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-000000000001', 'wrong', '2026-02-02 09:00+09');

update private.app_settings set value = '3'::jsonb where key = 'ai_consult_daily_calls_per_shop';
insert into ai_usage (shop_id, feature, model, cost_krw, ok, created_at) values
  ('b0000000-0000-0000-0000-000000000001', 'consult', 'm', 1.0, true, '2026-01-10 00:10+09'),
  ('b0000000-0000-0000-0000-000000000001', 'consult', 'm', 1.0, true, '2026-01-10 12:00+09'),
  ('b0000000-0000-0000-0000-000000000001', 'consult', 'm', 0, false, '2026-01-10 23:50+09'),
  ('b0000000-0000-0000-0000-000000000001', 'consult', 'm', 2.5, true, '2026-01-20 09:00+09'),
  ('b0000000-0000-0000-0000-000000000001', 'intake', 'm', 9, true, '2026-01-20 09:00+09'),
  ('b0000000-0000-0000-0000-000000000001', 'consult', 'm', 9, true, '2026-02-01 00:00+09'),
  ('b0000000-0000-0000-0000-000000000002', 'consult', 'm', 0.5, true, '2026-01-15 09:00+09');

-- 본사
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
create temp table m as select * from consult_admin_metrics('2026-01-01 00:00+09', '2026-02-01 00:00+09');
select is((select customer_messages from m), 6, '기간 안 손님 메시지 6건 (기간 앞·다음 달 0시는 뺀다)');
select is((select auto_replied from m), 2, '바로 다음이 보낸 AI 답인 손님 메시지 2건');
select is((select conversations from m), 4, '손님 메시지가 있었던 대화 4개');
select is((select escalated_conversations from m), 1, '문의가 열린 대화 1개 (같은 대화 두 번 = 1, 다음 달 문의는 뺀다)');
select is((select replied_conversations from m), 3, '응답한 대화 3개 (응답 없는 대화는 뺀다)');
select is((select first_reply_avg_sec from m), 250.0, '첫 응답 평균 (30 + 120 + 600) / 3초');
select is((select first_reply_median_sec from m), 120.0, '첫 응답 중앙값 120초');
select is((select (feedback_wrong, feedback_edited) from m), (1, 1), '틀림 1·고침 1 (다음 달 피드백은 뺀다)');

create temp table s as select * from consult_admin_shop_costs('2026-01-01 00:00+09', '2026-02-01 00:00+09');
select is((select (calls, failed, cost_krw) from s where shop_id = 'b0000000-0000-0000-0000-000000000001'), (4, 1, 4.5::numeric), '샵별 상담 호출·실패·비용 (다른 AI 기능·다음 달 제외)');
select is((select (max_day_calls, cap_days, daily_cap) from s where shop_id = 'b0000000-0000-0000-0000-000000000001'), (3, 1, 3), '한국 하루 최대 3회 = 상한 3회에 닿은 날 1일');
select is((select calls from s where shop_id = 'b0000000-0000-0000-0000-000000000002'), 1, '다른 샵도 따로');

create temp table empty as select * from consult_admin_metrics('2020-01-01 00:00+09', '2020-02-01 00:00+09');
select is((select (customer_messages, conversations, first_reply_avg_sec, first_reply_median_sec) from empty), (0, 0, null::numeric, null::numeric), '빈 기간은 0과 null (나누기 없음)');
select throws_ok($$ select * from consult_admin_metrics('2026-02-01', '2026-01-01') $$, '22023', null, '끝이 시작보다 앞이면 거부');
select throws_ok($$ select * from consult_admin_shop_costs('2024-01-01', '2026-01-01') $$, '22023', null, '400일 넘는 기간은 거부');

-- 샵 관리자·강사·anon은 거부
select pg_temp.as_user('a0000000-0000-0000-0000-000000000011');
select throws_ok($$ select * from consult_admin_metrics('2026-01-01 00:00+09', '2026-02-01 00:00+09') $$, '42501', null, '샵 관리자(자기 샵 데이터여도) 거부');
select throws_ok($$ select * from consult_admin_shop_costs('2026-01-01 00:00+09', '2026-02-01 00:00+09') $$, '42501', null, '샵 관리자 비용 거부');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000021');
select throws_ok($$ select * from consult_admin_metrics('2026-01-01 00:00+09', '2026-02-01 00:00+09') $$, '42501', null, '강사 거부');
reset role;
select set_config('role', 'anon', true);
select throws_ok($$ select * from consult_admin_metrics('2026-01-01 00:00+09', '2026-02-01 00:00+09') $$, '42501', null, 'anon 거부');
select throws_ok($$ select * from consult_admin_shop_costs('2026-01-01 00:00+09', '2026-02-01 00:00+09') $$, '42501', null, 'anon 비용 거부');
reset role;

-- 돌려주는 열에 글자(text·varchar·json)가 없다 → 손님 글·연락처·이름이 나갈 길이 없다
select is(
  (select count(*) from pg_proc p, unnest(p.proallargtypes, p.proargmodes) a(t, mode)
   where p.proname in ('consult_admin_metrics', 'consult_admin_shop_costs') and a.mode = 't'
     and a.t in ('text'::regtype, 'varchar'::regtype, 'bpchar'::regtype, 'json'::regtype, 'jsonb'::regtype, 'name'::regtype)),
  0::bigint, '출력 열은 숫자·uuid만');

select * from finish();
rollback;
