-- P16-2 운영 오류·AI 실패율 알림 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000066601', 'ops-shop@t', '{"role":"shop_admin","name":"운영샵"}'),
  ('00000000-0000-0000-0000-000000066609', 'ops-admin@t', '{}');
insert into profiles (id, role, name) values ('00000000-0000-0000-0000-000000066609', 'platform_admin', '본사')
  on conflict (id) do update set role = 'platform_admin';
insert into shops (id, name, status) values ('10000000-0000-0000-0000-000000066601', '운영샵', 'approved');
insert into shop_members (shop_id, user_id, is_owner) values ('10000000-0000-0000-0000-000000066601', '00000000-0000-0000-0000-000000066601', true);

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.alerts(k text) returns bigint language sql as $$
  select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-000000066609' and kind = k
$$;

-- 서버 오류: 한 시간에 5건부터 본사 관리자에게 한 번 알린다
select lives_ok($$select record_ops_event('server_error', '/shop/jobs/[id]', 'TypeError: x is undefined', false)$$, '오류 기록');
select record_ops_event('server_error', '/shop/jobs/[id]', 'e', false) from generate_series(1, 3);
select is(pg_temp.alerts('ops_errors'), 0::bigint, '4건까지는 알리지 않는다');
select record_ops_event('server_error', '/login', 'e', false);
select is(pg_temp.alerts('ops_errors'), 1::bigint, '5건째에 알린다');
select record_ops_event('server_error', '/login', 'e', false) from generate_series(1, 5);
select is(pg_temp.alerts('ops_errors'), 1::bigint, '같은 시간 안에는 한 번만');
select is((select (payload ->> 'count')::int from notifications where user_id = '00000000-0000-0000-0000-000000066609' and kind = 'ops_errors'), 5, '알림에 건수');

-- 크론 실행 기록은 알림을 만들지 않는다
select record_ops_event('cron_run', '/api/notify/dispatch', '{"sent":0}', true);
select is(pg_temp.alerts('ops_errors'), 1::bigint, '크론 성공 기록은 오류가 아니다');
select throws_ok($$select record_ops_event('weird', 'x', 'y', true)$$, '23514', null, '모르는 종류는 막는다');

-- 긴 내용은 잘라서 남긴다
select record_ops_event('server_error', repeat('p', 500), repeat('m', 1000), false);
select ok((select max(length(detail)) <= 300 and max(length(source)) <= 120 from ops_events), '길이 제한');

-- AI 실패율: 한 시간에 10회 이상 호출 중 30% 이상 실패면 알린다
select record_ai_usage('10000000-0000-0000-0000-000000066601', null, 'intake', 'claude-haiku-5-5', 10, 10, true) from generate_series(1, 7);
select record_ai_usage('10000000-0000-0000-0000-000000066601', null, 'intake', 'claude-haiku-5-5', 0, 0, false) from generate_series(1, 2);
select is(pg_temp.alerts('ai_fail_rate'), 0::bigint, '호출 9회(실패 2)는 알리지 않는다');
select record_ai_usage('10000000-0000-0000-0000-000000066601', null, 'intake', 'claude-haiku-5-5', 0, 0, false);
select is(pg_temp.alerts('ai_fail_rate'), 1::bigint, '10회 중 3회 실패(30%)면 알린다');
select record_ai_usage('10000000-0000-0000-0000-000000066601', null, 'intake', 'claude-haiku-5-5', 0, 0, false);
select is(pg_temp.alerts('ai_fail_rate'), 1::bigint, 'AI 실패율 알림도 한 시간에 한 번');

-- 권한: 기록은 서버만, 조회는 본사만
select pg_temp.login('00000000-0000-0000-0000-000000066601');
select throws_ok($$select record_ops_event('server_error', 'x', 'y', false)$$, '42501', null, '로그인 사용자는 기록할 수 없다');
select is((select count(*) from ops_events), 0::bigint, '샵 관리자는 운영 기록을 못 본다');
select pg_temp.login('00000000-0000-0000-0000-000000066609');
select ok((admin_ops_summary() ->> 'errors_1h')::int >= 10, '본사는 요약을 본다');

select * from finish();
rollback;
