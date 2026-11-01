-- P8-2 웹푸시 구독과 알림 발송 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000aaa01', 'ps-a@t', '{"role":"instructor","name":"푸시A"}'),
  ('00000000-0000-0000-0000-0000000aab01', 'ps-b@t', '{"role":"instructor","name":"푸시B"}');
insert into notifications (user_id, kind, payload) values
  ('00000000-0000-0000-0000-0000000aaa01', 'job_offer', '{}'),
  ('00000000-0000-0000-0000-0000000aaa01', 'bid_rejected', '{}');

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

select pg_temp.login('00000000-0000-0000-0000-0000000aaa01');
select lives_ok($$insert into push_subscriptions (user_id, endpoint, p256dh, auth) values (auth.uid(), 'https://push.example/a', 'k', 'a')$$, '자기 구독을 저장한다');
select throws_ok($$insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ('00000000-0000-0000-0000-0000000aab01', 'https://push.example/x', 'k', 'a')$$,
  '42501', null, '남의 구독은 만들 수 없다');
select throws_ok($$select * from claim_notifications(10)$$, '42501', null, '사용자는 발송 대기 알림을 가져갈 수 없다');

select pg_temp.login('00000000-0000-0000-0000-0000000aab01');
select is((select count(*) from push_subscriptions), 0::bigint, '남의 구독은 안 보인다');

select set_config('role', 'service_role', true), set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select count(*) from claim_notifications(10)), 2::bigint, '서버는 보내지 않은 알림을 가져간다');
select is((select count(*) from claim_notifications(10)), 0::bigint, '한 번 가져간 알림은 다시 가져가지 않는다');
select ok((select bool_and(sent_at is not null) from notifications where user_id = '00000000-0000-0000-0000-0000000aaa01'), '발송 시각이 남는다');

select * from finish();
rollback;
