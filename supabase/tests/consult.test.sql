-- P22-1 AI 상담 스키마: 다른 샵·강사·본사 차단, 직접 쓰기 금지, 메시지 중복 거부, 암호화·해시 형식, 상담 전용 AI 상한 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

-- 하이원 스노우렌탈(shop1)에 카카오 채널·대화·메시지·문의·피드백을 만든다 (서버 경로 = RPC)
insert into shop_channels (id, shop_id, channel, external_id, credentials_enc, enabled)
  values ('d2200000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'kakao', 'bot-1', 'v1.c2VjcmV0', true);
create temp table first_msg as
  select * from consult_record_customer_message('d2200000-0000-0000-0000-000000000001', repeat('a', 64), '[테스트] 손님', 'kakao-utt-1', '강습료 얼마예요?');
insert into ai_feedback (message_id, shop_id, kind) select message_id, 'b0000000-0000-0000-0000-000000000001', 'wrong' from first_msg;
select consult_open_inquiry((select conversation_id from first_msg), 'lesson', '{"people": 2}', '[테스트] 초안', null);

create function pg_temp.seen(uid text, q text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  begin execute q into n; exception when insufficient_privilege then n := 0; end;
  reset role;
  return n;
end $$;
create function pg_temp.leaks(uid text) returns text[] language plpgsql as $$
declare t text; n bigint; out text[] := '{}';
begin
  foreach t in array array['conversations', 'messages', 'shop_knowledge', 'shop_channels', 'shop_consult_settings', 'ai_feedback', 'inquiries'] loop
    n := pg_temp.seen(uid, format('select count(*) from %I where shop_id = %L', t, 'b0000000-0000-0000-0000-000000000001'));
    if n > 0 then out := out || (t || ':' || n); end if;
  end loop;
  return out;
end $$;
create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- 읽기 차단 (빈 표로 통과하지 않게 shop1 자신은 본다)
select is(pg_temp.leaks('a0000000-0000-0000-0000-000000000011'),
  array['conversations:1', 'messages:1', 'shop_knowledge:8', 'shop_channels:1', 'shop_consult_settings:1', 'ai_feedback:1', 'inquiries:1'],
  'shop1 관리자는 자기 샵 상담 자료를 본다(대조군)');
select is(pg_temp.leaks('a0000000-0000-0000-0000-000000000012'), '{}'::text[], '다른 샵 관리자는 0건');
select is(pg_temp.leaks('a0000000-0000-0000-0000-000000000013'), '{}'::text[], '강습팀 관리자는 0건');
select is(pg_temp.leaks('a0000000-0000-0000-0000-000000000021'), '{}'::text[], '강사는 0건');
select is(pg_temp.leaks('a0000000-0000-0000-0000-000000000001'), '{}'::text[], '본사 관리자도 0건(손님 상담 내용)');

-- 비밀 열은 자기 샵도 못 읽는다
select pg_temp.as_user('a0000000-0000-0000-0000-000000000011');
select throws_ok($$ select credentials_enc from shop_channels $$, '42501', null, '샵 관리자는 채널 비밀 열을 못 읽는다');
select lives_ok($$ select id, channel, enabled from shop_channels $$, '비밀이 아닌 열은 읽는다');

-- 로그인 사용자는 메시지를 직접 쓰지 못한다
select throws_ok($$ insert into messages (conversation_id, shop_id, channel, role, text)
                    select conversation_id, 'b0000000-0000-0000-0000-000000000001', 'kakao', 'ai', '가짜 답' from first_msg $$,
  '42501', null, '자기 샵이어도 messages INSERT 금지');
select throws_ok($$ update messages set text = '고침' $$, '42501', null, 'messages UPDATE 금지');
select throws_ok($$ insert into conversations (shop_id, channel, channel_id, external_user_hash)
                    values ('b0000000-0000-0000-0000-000000000001', 'kakao', 'd2200000-0000-0000-0000-000000000001', repeat('b', 64)) $$,
  '42501', null, 'conversations INSERT 금지');
select throws_ok($$ select consult_record_customer_message('d2200000-0000-0000-0000-000000000001', repeat('c', 64), null, 'x', 'y') $$,
  '42501', null, '웹훅 저장 RPC는 서버 전용');
select throws_ok($$ select set_consult_settings('b0000000-0000-0000-0000-000000000002', true, null, null) $$,
  '42501', null, '다른 샵 상담 설정은 못 바꾼다');
select lives_ok($$ select set_consult_settings('b0000000-0000-0000-0000-000000000001', true, null, null) $$, '자기 샵 자동응답 켜기');
reset role;
select is((select count(*) from audit_events where action = 'consult_auto_reply_on' and shop_id = 'b0000000-0000-0000-0000-000000000001'), 1::bigint,
  '자동응답 켜기는 감사 기록에 남는다');

-- 같은 채널 메시지 id는 한 번만
select is((select duplicate from consult_record_customer_message('d2200000-0000-0000-0000-000000000001', repeat('a', 64), null, 'kakao-utt-1', '강습료 얼마예요?')),
  true, '같은 channel_message_id 재전송은 중복으로 처리');
select throws_ok($$ insert into messages (conversation_id, shop_id, channel, role, text, channel_message_id)
                    select conversation_id, 'b0000000-0000-0000-0000-000000000001', 'kakao', 'customer', '다시', 'kakao-utt-1' from first_msg $$,
  '23505', null, '직접 넣어도 channel_message_id 중복은 거부');

-- 형식: 평문 비밀·해시가 아닌 손님 id는 못 넣는다
select throws_ok($$ update shop_channels set credentials_enc = 'plain-token' $$, '23514', null, '암호화하지 않은 비밀은 거부');
select throws_ok($$ select consult_record_customer_message('d2200000-0000-0000-0000-000000000001', 'kakao-user-123', null, 'kakao-utt-2', 'hi') $$,
  '23514', null, 'HMAC 해시가 아닌 손님 id는 거부');

-- 상담 AI 상한은 기존 상한(200)과 따로 센다
insert into ai_usage (shop_id, feature, model, ok) select 'b0000000-0000-0000-0000-000000000001', 'intake', 'm', true from generate_series(1, 200);
select is((select reason from ai_gate('b0000000-0000-0000-0000-000000000001', 'consult')), 'ok', '다른 기능이 200회를 써도 상담은 된다');
insert into ai_usage (shop_id, feature, model, ok) select 'b0000000-0000-0000-0000-000000000001', 'consult', 'm', true from generate_series(1, 300);
select is((select reason from ai_gate('b0000000-0000-0000-0000-000000000001', 'consult')), 'daily_cap', '상담은 하루 300회에서 멈춘다');

-- 새 샵은 기본 안내 템플릿 8개를 비활성으로 받는다
insert into shops (id, type, name, business_no, owner_name, status, created_by)
  values ('b2200000-0000-0000-0000-000000000009', 'rental_shop', '[테스트] 새 샵', '000-00-22009', '[테스트]', 'pending', 'a0000000-0000-0000-0000-000000000011');
select is((select count(*) filter (where not is_active) from shop_knowledge where shop_id = 'b2200000-0000-0000-0000-000000000009'), 8::bigint,
  '새 샵에 기본 템플릿 8개(비활성)');

select * from finish();
rollback;
