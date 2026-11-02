-- P14-1 AI 공통 기반: 사용량 기록·샵 격리·상한·켜기/끄기 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000055501', 'ai-shop@t', '{"role":"shop_admin","name":"에이아이샵"}'),
  ('00000000-0000-0000-0000-000000055502', 'ai-other@t', '{"role":"shop_admin","name":"옆에이아이"}');
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-000000055509', 'ai-admin@t', '{}');
insert into profiles (id, role, name) values ('00000000-0000-0000-0000-000000055509', 'platform_admin', '본사');
insert into shops (id, name, status) values
  ('10000000-0000-0000-0000-000000055501', '에이아이샵', 'approved'),
  ('10000000-0000-0000-0000-000000055502', '옆에이아이', 'approved');
insert into shop_members (shop_id, user_id, is_owner) values
  ('10000000-0000-0000-0000-000000055501', '00000000-0000-0000-0000-000000055501', true),
  ('10000000-0000-0000-0000-000000055502', '00000000-0000-0000-0000-000000055502', true);

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- 기본값: 기능 켜짐, 모델은 설정값
select is((select allowed from ai_gate('10000000-0000-0000-0000-000000055501', 'intake')), true, '기본으로 켜져 있다');
select is((select model from ai_gate('10000000-0000-0000-0000-000000055501', 'intake')), 'claude-haiku-5-5', '텍스트 모델 설정값');
select is((select model from ai_gate('10000000-0000-0000-0000-000000055501', 'cert')), 'claude-sonnet-5-5', '이미지 모델 설정값');
select throws_ok($$select * from ai_gate('10000000-0000-0000-0000-000000055501', 'unknown')$$, '22023', null, '모르는 기능');

-- 사용량 기록과 일일 상한
select lives_ok($$select record_ai_usage('10000000-0000-0000-0000-000000055501', null, 'intake', 'claude-haiku-5-5', 1000, 200, true)$$, '사용량 기록');
select ok((select cost_krw > 0 from ai_usage where shop_id = '10000000-0000-0000-0000-000000055501'), '단가로 비용 계산');
update private.app_settings set value = '2' where key = 'ai_daily_calls_per_shop';
select record_ai_usage('10000000-0000-0000-0000-000000055501', null, 'intake', 'claude-haiku-5-5', 10, 10, false);
select is((select (allowed, reason) from ai_gate('10000000-0000-0000-0000-000000055501', 'intake')), (false, 'daily_cap'::text), '샵 하루 상한을 넘으면 끈다');
select is((select allowed from ai_gate('10000000-0000-0000-0000-000000055502', 'intake')), true, '다른 샵은 영향 없음');
update private.app_settings set value = '200' where key = 'ai_daily_calls_per_shop';

-- 월 비용 상한: 넘으면 끄고 관리자에게 한 번 알림
update private.app_settings set value = '0' where key = 'ai_monthly_cap_krw';  -- 이미 쓴 비용이 상한 이상
select is((select (allowed, reason) from ai_gate('10000000-0000-0000-0000-000000055502', 'intake')), (false, 'monthly_cap'::text), '플랫폼 월 상한');
select ai_gate('10000000-0000-0000-0000-000000055502', 'intake');
select is((select count(*)::int from notifications where kind = 'ai_cap_reached' and user_id = '00000000-0000-0000-0000-000000055509'), 1, '관리자 알림은 한 번만');
update private.app_settings set value = '80000' where key = 'ai_monthly_cap_krw';

-- 샵이 끄기, 플랫폼 기본값 끄기
select pg_temp.login('00000000-0000-0000-0000-000000055501');
select lives_ok($$select set_shop_ai('10000000-0000-0000-0000-000000055501', 'intake', false)$$, '샵이 끈다');
select throws_ok($$select set_shop_ai('10000000-0000-0000-0000-000000055502', 'intake', false)$$, '42501', null, '다른 샵 설정은 못 바꾼다');
select is((select count(*)::int from ai_usage), 2, '샵은 자기 사용량만 본다');
select throws_ok($$select set_ai_default('intake', false)$$, '42501', null, '플랫폼 기본값은 관리자만');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select (allowed, reason) from ai_gate('10000000-0000-0000-0000-000000055501', 'intake')), (false, 'shop_off'::text), '샵이 끄면 수동 흐름');

select pg_temp.login('00000000-0000-0000-0000-000000055509');
select lives_ok($$select set_ai_default('bid_assist', false)$$, '관리자가 기능 기본값을 끈다');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select (allowed, reason) from ai_gate('10000000-0000-0000-0000-000000055502', 'bid_assist')), (false, 'platform_off'::text), '플랫폼에서 끄면 모든 샵에서 꺼진다');

select * from finish();
rollback;
