-- P22-5 사장님 인박스: 사장님 답장·대화 닫기 RPC는 자기 샵 멤버만(다른 샵·강습팀·강사·본사·anon 거부), 카카오는 직접 보낸 답장만,
-- 답하면 문의 replied·대화 owner, 새 문의가 오면 다시 대기, 인스타 손님 id(암호화) 열은 샵 관리자도 못 읽는다 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- shop1(하이원 스노우렌탈)에 인스타·카카오 대화와 열린 문의를 만든다 (서버 경로 = RPC)
insert into shop_channels (id, shop_id, channel, external_id, credentials_enc, enabled) values
  ('d2250000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'instagram', '17841400000000051', 'v1.dG9rZW4=', true),
  ('d2250000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'kakao', 'bot-inbox', null, true);
create temp table ig as select * from consult_record_customer_message('d2250000-0000-0000-0000-000000000001', repeat('e', 64), null, 'ig-inbox-1', '20일 2명 예약돼요?');
create temp table kk as select * from consult_record_customer_message('d2250000-0000-0000-0000-000000000002', repeat('f', 64), null, 'kk-inbox-1', '예약 문의요');
select consult_open_inquiry((select conversation_id from ig), 'booking', '{"people": 2}', '[테스트] 초안', null);
select consult_open_inquiry((select conversation_id from kk), 'booking', '{}', '[테스트] 초안', null);
grant select on ig, kk to authenticated;

-- 인스타 손님 id 열: 암호화 값만, 샵 관리자도 못 읽는다
select throws_ok($$ update conversations set reply_to_enc = 'ig-user-plain' where id = (select conversation_id from ig) $$, '23514', null, '평문 손님 id는 거부');
select lives_ok($$ update conversations set reply_to_enc = 'v1.dXNlcg==' where id = (select conversation_id from ig) $$, '암호화 값은 저장(서버)');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000011');
select throws_ok($$ select reply_to_enc from conversations $$, '42501', null, '샵 관리자는 손님 id 열을 못 읽는다');
select is((select status from conversations where id = (select conversation_id from ig)), 'waiting_owner', '나머지 열은 읽는다(문의가 열리면 대기)');
reset role;

-- 다른 샵·강습팀·강사·본사는 답장·닫기 불가
select pg_temp.as_user('a0000000-0000-0000-0000-000000000012');
select throws_ok($$ select consult_owner_reply((select conversation_id from ig), '답장', 'sent', 'RESPONSE') $$, '42501', null, '다른 샵 관리자는 답장 기록 불가');
select throws_ok($$ select consult_close_conversation((select conversation_id from ig)) $$, '42501', null, '다른 샵 관리자는 닫기 불가');
select is((select count(*) from messages where shop_id = 'b0000000-0000-0000-0000-000000000001'), 0::bigint, '다른 샵 관리자는 메시지 0건');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000013');
select throws_ok($$ select consult_owner_reply((select conversation_id from ig), '답장', 'sent', null) $$, '42501', null, '강습팀 관리자도 불가');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000021');
select throws_ok($$ select consult_owner_reply((select conversation_id from ig), '답장', 'sent', null) $$, '42501', null, '강사는 불가');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
select throws_ok($$ select consult_owner_reply((select conversation_id from ig), '답장', 'sent', null) $$, '42501', null, '본사 관리자도 불가(손님 상담)');
select throws_ok($$ select consult_close_conversation((select conversation_id from kk)) $$, '42501', null, '본사 관리자는 닫기도 불가');
reset role;
select is(has_function_privilege('anon', 'public.consult_owner_reply(uuid, text, text, text)', 'execute'), false, 'anon은 답장 RPC 실행 불가');
select is(has_function_privilege('anon', 'public.consult_close_conversation(uuid)', 'execute'), false, 'anon은 닫기 RPC 실행 불가');
select throws_ok($$ select consult_owner_reply(gen_random_uuid(), '답장', 'sent', null) $$, '42501', null, '없는 대화도 같은 오류(서버 역할에도 샵 멤버가 아님)');

-- 자기 샵: 검사 → 기록
select pg_temp.as_user('a0000000-0000-0000-0000-000000000011');
select throws_ok($$ select consult_owner_reply((select conversation_id from ig), '   ', 'sent', null) $$, '22023', null, '빈 답장 거부');
select throws_ok($$ select consult_owner_reply((select conversation_id from ig), '답장', 'pending', null) $$, '22023', null, '발송 결과 값이 아니면 거부');
select throws_ok($$ select consult_owner_reply((select conversation_id from ig), '답장', 'sent', 'POST_PURCHASE_UPDATE') $$, '22023', null, '모르는 태그 거부');
select throws_ok($$ select consult_owner_reply((select conversation_id from kk), '답장', 'sent', null) $$, '22023', null, '카카오는 보냈다고 기록할 수 없다(먼저 보내기 불가)');
select lives_ok($$ select consult_owner_reply((select conversation_id from ig), '[테스트] 20일 2명 가능해요', 'sent', 'HUMAN_AGENT') $$, '인스타 승인 발송 기록');
select lives_ok($$ select consult_owner_reply((select conversation_id from kk), '[테스트] 1:1 채팅으로 답했어요', 'skipped', null) $$, '카카오 복사(직접 보냄) 기록');
reset role;
select is((select row(role, delivery_status, tag)::text from messages where conversation_id = (select conversation_id from ig) and role = 'owner'),
  '(owner,sent,HUMAN_AGENT)', '사장님 답장·발송 결과·태그');
select is((select array_agg(i.status || '/' || c.status order by c.channel) from inquiries i join conversations c on c.id = i.conversation_id
           where c.id in ((select conversation_id from ig), (select conversation_id from kk))),
  array['replied/owner', 'replied/owner'], '답하면 문의는 replied, 대화는 owner');
select is((select count(*) from audit_events where action = 'consult_owner_reply' and actor_id = 'a0000000-0000-0000-0000-000000000011'), 2::bigint,
  '답장은 보낸 관리자 이름으로 감사 기록');

-- 실패한 발송은 문의를 그대로 둔다 / 새 문의가 오면 다시 대기
select consult_open_inquiry((select conversation_id from ig), 'booking', '{}', '[테스트] 새 초안', null);
select is((select status from conversations where id = (select conversation_id from ig)), 'waiting_owner', '답한 대화에 새 문의 → 다시 사장님 대기');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000011');
select consult_owner_reply((select conversation_id from ig), '[테스트] 실패', 'failed', 'RESPONSE');
select lives_ok($$ select consult_close_conversation((select conversation_id from ig)) $$, '자기 샵 대화 닫기');
reset role;
select is((select array_agg(status order by created_at) from inquiries where conversation_id = (select conversation_id from ig)),
  array['replied', 'closed'], '실패한 발송은 문의를 그대로 두고, 닫으면 열린 문의만 closed');

select * from finish();
rollback;
