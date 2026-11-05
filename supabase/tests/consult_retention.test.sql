-- P22-6 AI 상담 보존 기간 정리·[강습 등록]: 90일 지난 대화·메시지·피드백 삭제, 최근 것은 남김, 강습 등록으로 넘긴 문의는
-- 연락처·대화 연결·초안을 지우고 남김, 나머지 문의는 함께 삭제, 상담과 무관한 문의·다른 샵 최근 상담은 그대로,
-- 정리 함수는 서버(service_role)만, [강습 등록]은 샵 대표만 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- shop1(하이원)에 대표가 아닌 직원 한 명
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000226601', 'ret-staff@t', '{"role":"shop_admin","name":"[테스트] 직원"}');
insert into shop_members (shop_id, user_id, is_owner) values ('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000226601', false);

insert into shop_channels (id, shop_id, channel, external_id, enabled) values
  ('d2260000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'kakao', 'bot-ret-1', true),
  ('d2260000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'kakao', 'bot-ret-2', true);

-- 대화: 오래된 것 2개(shop1), 최근 것 1개(shop1), 오래된 대화에 최근 메시지가 있는 것 1개(shop1), 다른 샵 최근 1개·오래된 1개
insert into conversations (id, shop_id, channel, channel_id, external_user_hash, created_at, last_customer_message_at) values
  ('c2260000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'kakao', 'd2260000-0000-0000-0000-000000000001', repeat('1', 64), now() - interval '120 days', now() - interval '100 days'),
  ('c2260000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'kakao', 'd2260000-0000-0000-0000-000000000001', repeat('2', 64), now() - interval '95 days', now() - interval '91 days'),
  ('c2260000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'kakao', 'd2260000-0000-0000-0000-000000000001', repeat('3', 64), now() - interval '10 days', now() - interval '1 day'),
  ('c2260000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'kakao', 'd2260000-0000-0000-0000-000000000001', repeat('4', 64), now() - interval '150 days', now() - interval '89 days'),
  ('c2260000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000002', 'kakao', 'd2260000-0000-0000-0000-000000000002', repeat('5', 64), now() - interval '5 days', now() - interval '5 days'),
  ('c2260000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000002', 'kakao', 'd2260000-0000-0000-0000-000000000002', repeat('6', 64), now() - interval '200 days', now() - interval '200 days');

insert into messages (id, conversation_id, shop_id, channel, role, text, sent_at) values
  ('a2260000-0000-0000-0000-000000000001', 'c2260000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'kakao', 'customer', '[테스트] 오래된 문의', now() - interval '100 days'),
  ('a2260000-0000-0000-0000-000000000002', 'c2260000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'kakao', 'ai', '[테스트] 오래된 답', now() - interval '100 days'),
  ('a2260000-0000-0000-0000-000000000003', 'c2260000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'kakao', 'customer', '[테스트] 오래된 예약', now() - interval '91 days'),
  ('a2260000-0000-0000-0000-000000000004', 'c2260000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'kakao', 'customer', '[테스트] 최근 문의', now() - interval '1 day'),
  ('a2260000-0000-0000-0000-000000000005', 'c2260000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'kakao', 'customer', '[테스트] 아주 예전 글', now() - interval '140 days'),
  ('a2260000-0000-0000-0000-000000000006', 'c2260000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'kakao', 'customer', '[테스트] 최근 글', now() - interval '89 days'),
  ('a2260000-0000-0000-0000-000000000007', 'c2260000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000002', 'kakao', 'customer', '[테스트] 다른 샵 최근', now() - interval '5 days'),
  ('a2260000-0000-0000-0000-000000000008', 'c2260000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000002', 'kakao', 'customer', '[테스트] 다른 샵 오래됨', now() - interval '200 days');

insert into ai_feedback (message_id, shop_id, kind, created_at) values
  ('a2260000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'wrong', now() - interval '99 days'),
  ('a2260000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'wrong', now() - interval '1 day');

-- 문의: 오래된 대화1 = 강습 등록(converted, 연락처 있음), 오래된 대화2 = 답장함(연락처 있음), 최근 대화 = 열림, 다른 샵 오래된 대화 = 열림,
-- 대화와 무관한 예전 문의(상담 이전 기능)
insert into inquiries (id, shop_id, channel, conversation_id, type, status, contact_enc, ai_draft, extracted, converted_at, created_at) values
  ('e2260000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'kakao', 'c2260000-0000-0000-0000-000000000001', 'booking', 'converted', 'v1.Y29udGFjdA==', '[테스트] 초안', '{"people": 2}', now() - interval '99 days', now() - interval '100 days'),
  ('e2260000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'kakao', 'c2260000-0000-0000-0000-000000000002', 'booking', 'replied', 'v1.Y29udGFjdA==', null, '{}', null, now() - interval '91 days'),
  ('e2260000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'kakao', 'c2260000-0000-0000-0000-000000000003', 'booking', 'open', 'v1.Y29udGFjdA==', null, '{}', null, now() - interval '1 day'),
  ('e2260000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002', 'kakao', 'c2260000-0000-0000-0000-000000000006', 'other', 'open', null, null, '{}', null, now() - interval '200 days'),
  ('e2260000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000001', 'phone', null, null, 'open', null, null, '{}', null, now() - interval '300 days');

-- 정리 함수 권한: 로그인 사용자·anon은 못 부른다
select is(has_function_privilege('anon', 'public.purge_consult_data()', 'execute'), false, 'anon은 정리 함수 실행 불가');
select is(has_function_privilege('authenticated', 'public.purge_consult_data()', 'execute'), false, '로그인 사용자도 정리 함수 실행 불가');
select is(has_function_privilege('service_role', 'public.purge_consult_data()', 'execute'), true, '서버(service_role)만 실행');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000011');
select throws_ok($$ select purge_consult_data() $$, '42501', null, '샵 대표가 불러도 거부');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
select throws_ok($$ select purge_consult_data() $$, '42501', null, '본사 관리자가 불러도 거부');
reset role;
select set_config('request.jwt.claims', '', true);

-- 정리 실행
select is(purge_consult_data(),
  '{"conversations": 3, "messages": 5, "feedback": 1, "inquiries_deleted": 2, "inquiries_kept": 1}'::jsonb,
  '오래된 대화 3개(shop1 2·다른 샵 1)·메시지 5개(대화와 함께 4 + 남는 대화의 오래된 글 1)·피드백 1개·문의 2개 삭제, 강습 등록 1개 보존');

select is((select array_agg(id order by id) from conversations where id::text like 'c2260000%'),
  array['c2260000-0000-0000-0000-000000000003', 'c2260000-0000-0000-0000-000000000004', 'c2260000-0000-0000-0000-000000000005']::uuid[],
  '최근 활동이 있는 대화만 남는다(오래 전에 시작했어도 90일 안에 글이 있으면 남김)');
select is((select count(*)::int from messages where conversation_id = 'c2260000-0000-0000-0000-000000000001'), 0, '오래된 대화의 메시지 삭제');
select is((select count(*)::int from messages where id = 'a2260000-0000-0000-0000-000000000005'), 0, '남는 대화 안에서도 90일 지난 글은 삭제');
select is((select count(*)::int from messages where id = 'a2260000-0000-0000-0000-000000000006'), 1, '남는 대화의 최근 글은 남김');
select is((select count(*)::int from messages where id = 'a2260000-0000-0000-0000-000000000004'), 1, '최근 대화의 메시지는 남김');
select is((select count(*)::int from ai_feedback where message_id = 'a2260000-0000-0000-0000-000000000002'), 0, '오래된 피드백 삭제');
select is((select count(*)::int from ai_feedback where message_id = 'a2260000-0000-0000-0000-000000000004'), 1, '최근 피드백은 남김');

-- 강습 등록 문의: 남기되 연락처·대화 연결·초안은 비운다 (유형·추출 정보·등록 시각은 남김)
select is((select count(*)::int from inquiries where id = 'e2260000-0000-0000-0000-000000000001'), 1, '강습 등록으로 넘긴 문의는 남는다');
select is((select contact_enc from inquiries where id = 'e2260000-0000-0000-0000-000000000001'), null, '남긴 문의의 연락처는 지운다');
select is((select conversation_id from inquiries where id = 'e2260000-0000-0000-0000-000000000001'), null, '대화 연결도 지운다');
select is((select ai_draft from inquiries where id = 'e2260000-0000-0000-0000-000000000001'), null, 'AI 초안(손님 글로 만든 글)도 지운다');
select is((select status || '/' || type || '/' || (extracted ->> 'people') from inquiries where id = 'e2260000-0000-0000-0000-000000000001'),
  'converted/booking/2', '상태·유형·추출 정보는 남는다');
select is((select count(*)::int from inquiries where id in ('e2260000-0000-0000-0000-000000000002', 'e2260000-0000-0000-0000-000000000004')), 0,
  '지운 대화의 나머지 문의(답장함·열림, 다른 샵 포함)는 삭제');
select is((select contact_enc from inquiries where id = 'e2260000-0000-0000-0000-000000000003'), 'v1.Y29udGFjdA==', '최근 대화의 문의·연락처는 그대로');
select is((select count(*)::int from inquiries where id = 'e2260000-0000-0000-0000-000000000005'), 1, '대화와 무관한 예전 문의는 건드리지 않는다');
select is((select count(*)::int from conversations where id = 'c2260000-0000-0000-0000-000000000005'), 1, '다른 샵 최근 대화는 그대로');
select is(purge_consult_data() ->> 'conversations', '0', '다시 불러도 지울 것이 없다');

-- [강습 등록]: 샵 대표만 (대표가 아닌 직원·다른 샵·강사·anon 거부)
select pg_temp.as_user('00000000-0000-0000-0000-000000226601');
select throws_ok($$ select consult_convert_inquiry('e2260000-0000-0000-0000-000000000003') $$, '42501', null, '대표가 아닌 직원은 강습 등록 불가');
select throws_ok($$ update inquiries set status = 'converted' where id = 'e2260000-0000-0000-0000-000000000003' $$, '42501', null, '상태를 직접 고칠 수도 없다(열 권한)');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000012');
select throws_ok($$ select consult_convert_inquiry('e2260000-0000-0000-0000-000000000003') $$, '42501', null, '다른 샵 대표는 불가');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000021');
select throws_ok($$ select consult_convert_inquiry('e2260000-0000-0000-0000-000000000003') $$, '42501', null, '강사는 불가');
reset role;
select is(has_function_privilege('anon', 'public.consult_convert_inquiry(uuid)', 'execute'), false, 'anon은 강습 등록 RPC 실행 불가');

select pg_temp.as_user('a0000000-0000-0000-0000-000000000011');
select lives_ok($$ select consult_convert_inquiry('e2260000-0000-0000-0000-000000000003') $$, '샵 대표는 강습 등록으로 넘긴다');
select is((select status from inquiries where id = 'e2260000-0000-0000-0000-000000000003'), 'converted', '상태가 converted');
select throws_ok($$ select consult_convert_inquiry('e2260000-0000-0000-0000-000000000003') $$, '22023', null, '이미 넘긴 문의는 다시 못 넘긴다');
reset role;
select is((select count(*)::int from audit_events where action = 'consult_inquiry_converted' and target_id = 'e2260000-0000-0000-0000-000000000003'), 1, '감사 기록에 남는다');

select * from finish();
rollback;
