-- P22-4 인스타 채널 연결·해제·답변 태그: 서버 전용 연결, 샵 멤버 확인, 계정 하나 = 샵 하나, 해제는 자기 샵만 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- 연결은 서버(service_role)만, 샵 멤버가 시작한 연결만
select pg_temp.as_user('a0000000-0000-0000-0000-000000000011');
select throws_ok($$ select consult_connect_instagram('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000011',
                    '17841400000000001', 'v1.dG9rZW4=', now() + interval '60 days') $$,
  '42501', null, '로그인 사용자는 연결 RPC를 직접 못 부른다');
reset role;

set local role service_role;
select throws_ok($$ select consult_connect_instagram('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000012',
                    '17841400000000001', 'v1.dG9rZW4=', now() + interval '60 days') $$,
  '42501', null, '다른 샵 관리자가 시작한 연결은 거부');
select throws_ok($$ select consult_connect_instagram('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000011',
                    'not-a-number', 'v1.dG9rZW4=', now()) $$,
  '22023', null, '계정 id 형식이 아니면 거부');
select throws_ok($$ select consult_connect_instagram('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000011',
                    '17841400000000001', 'plain-token', now()) $$,
  '23514', null, '암호화하지 않은 토큰은 거부');
select lives_ok($$ select consult_connect_instagram('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000011',
                    '17841400000000001', 'v1.dG9rZW4=', now() + interval '60 days') $$,
  'shop1 관리자가 시작한 연결은 저장');
select is((select enabled from shop_channels where shop_id = 'b0000000-0000-0000-0000-000000000001' and channel = 'instagram'), true, '연결하면 켜진다');
select lives_ok($$ select consult_connect_instagram('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000011',
                    '17841400000000001', 'v1.bmV3', now() + interval '60 days') $$,
  '다시 연결하면 같은 행을 고친다');
select is((select count(*) from shop_channels where shop_id = 'b0000000-0000-0000-0000-000000000001' and channel = 'instagram'), 1::bigint, '샵당 인스타 채널은 하나');
select throws_ok($$ select consult_connect_instagram('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000012',
                    '17841400000000001', 'v1.dG9rZW4=', now()) $$,
  '23505', null, '이미 다른 샵에 연결된 인스타 계정은 거부');
reset role;
select is((select count(*) from audit_events where action = 'consult_channel_connected' and shop_id = 'b0000000-0000-0000-0000-000000000001'
             and actor_id = 'a0000000-0000-0000-0000-000000000011'), 2::bigint, '연결은 시작한 관리자 이름으로 감사 기록');

-- 답변 기록: 태그를 남기고, 태그 없는 기존 호출(카카오)도 그대로
create temp table conv as
  select * from consult_record_customer_message((select id from shop_channels where shop_id = 'b0000000-0000-0000-0000-000000000001' and channel = 'instagram'),
                                                 repeat('d', 64), null, 'ig-mid-1', '강습료 얼마예요?');
create temp table r1 as select consult_record_reply((select conversation_id from conv), 'ai', '안내드려요', 'price', 0.9, 'consult-v1', 'sent', 'RESPONSE') as id;
create temp table r2 as select consult_record_reply((select conversation_id from conv), 'system', '전달했어요', 'booking', 0.5, 'consult-v1', 'sent') as id;
select is((select tag from messages where id = (select id from r1)), 'RESPONSE', '답변에 발송 태그를 남긴다');
select is((select count(*) from messages where id = (select id from r2) and tag is null), 1::bigint, '태그 없는 7개 인자 호출도 동작');

-- 해제는 자기 샵만
select pg_temp.as_user('a0000000-0000-0000-0000-000000000012');
select throws_ok($$ select consult_disconnect_channel('b0000000-0000-0000-0000-000000000001', 'instagram') $$, '42501', null, '다른 샵 채널은 해제 못 한다');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000011');
select lives_ok($$ select consult_disconnect_channel('b0000000-0000-0000-0000-000000000001', 'instagram') $$, '자기 샵 인스타 해제');
reset role;
select is((select row(enabled, credentials_enc, external_id)::text from shop_channels where shop_id = 'b0000000-0000-0000-0000-000000000001' and channel = 'instagram'),
  '(f,,)', '해제하면 꺼지고 토큰·계정 id를 지운다');
set local role service_role;
select lives_ok($$ select consult_connect_instagram('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000012',
                    '17841400000000001', 'v1.dG9rZW4=', now()) $$,
  '해제한 계정은 다른 샵이 연결할 수 있다');
reset role;

select * from finish();
rollback;
