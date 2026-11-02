-- P16-7 시범 운영 지표 (pgTAP). 개인정보 없이 샵 단위 집계만.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000099901', 'pm-shop@t', '{"role":"shop_admin","name":"지표샵사장"}'),
  ('00000000-0000-0000-0000-000000099902', 'pm-test@t', '{"role":"shop_admin","name":"테스트사장"}');
insert into shops (id, name, status, created_at) values
  ('10000000-0000-0000-0000-000000099901', '지표샵', 'approved', now() - interval '10 days'),
  ('10000000-0000-0000-0000-000000099902', '[테스트] 지표샵', 'approved', now() - interval '10 days');
insert into shop_members (shop_id, user_id, is_owner) values
  ('10000000-0000-0000-0000-000000099901', '00000000-0000-0000-0000-000000099901', true);
-- 가입 24시간 뒤 첫 강습, 직접 2건(1건 취소) + 입찰 2건(1건만 입찰 받음)
insert into jobs (id, shop_id, starts_at, ends_at, assign_mode, status, created_at) values
  ('e0000000-0000-0000-0000-000000099901', '10000000-0000-0000-0000-000000099901', now() + interval '1 day', now() + interval '1 day 2 hours', 'direct', 'assigned', now() - interval '9 days'),
  ('e0000000-0000-0000-0000-000000099902', '10000000-0000-0000-0000-000000099901', now() + interval '2 day', now() + interval '2 day 2 hours', 'direct', 'canceled', now() - interval '1 day'),
  ('e0000000-0000-0000-0000-000000099903', '10000000-0000-0000-0000-000000099901', now() + interval '3 day', now() + interval '3 day 2 hours', 'bid', 'open', now() - interval '1 day'),
  ('e0000000-0000-0000-0000-000000099904', '10000000-0000-0000-0000-000000099901', now() + interval '4 day', now() + interval '4 day 2 hours', 'bid', 'open', now() - interval '1 day');
insert into bids (job_id, instructor_id, amount)
  select 'e0000000-0000-0000-0000-000000099903', id, 70000 from instructors where id = 'c0000000-0000-0000-0000-000000000021';
insert into ai_usage (shop_id, feature, model, cost_krw, ok) values
  ('10000000-0000-0000-0000-000000099901', 'intake', 'claude-haiku-5-5', 1.5, true),
  ('10000000-0000-0000-0000-000000099901', 'intake', 'claude-haiku-5-5', 0, false),
  ('10000000-0000-0000-0000-000000099901', 'note_tidy', 'claude-haiku-5-5', 0.5, true);

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

create temp view m as select * from admin_pilot_metrics(false) where shop_id = '10000000-0000-0000-0000-000000099901';
select is((select round(hours_to_first_job) from m), 24::numeric, '첫 강습까지 24시간');
select is((select jobs_total from m), 4, '강습 등록 4건');
select is((select sum(v::int)::int from m, jsonb_array_elements(weekly) v), 4, '8주 주간 등록 수 합 = 4 (요일과 무관)');
select is((select jsonb_array_length(weekly) from m), 8, '8주');
select is((select bid_participation_pct from m), 50::numeric, '입찰 공고 2건 중 1건에 입찰');
select is((select cancel_rate_pct from m), 25::numeric, '취소율 25%');
select is((select (ai_calls, ai_calls_ok, ai_features_used) from m), (3, 2, 2), 'AI 호출·성공·쓴 기능 수');
select is((select ai_cost_krw from m), 2.00::numeric, 'AI 비용');
select is((select count(*) from admin_pilot_metrics(false) where shop_name like '[테스트]%'), 0::bigint, '테스트 샵은 기본으로 뺀다');
select is((select count(*) from admin_pilot_metrics(true) where shop_name like '[테스트]%' and shop_id = '10000000-0000-0000-0000-000000099902'), 1::bigint, '포함하면 보인다');

-- admin_metric 확장
select is((select value from admin_metric('cancel_rate_by_shop', null) where label = '지표샵'), 25::numeric, 'admin_metric: 샵별 취소율');
select ok((select count(*) from admin_metric('pilot_weekly_jobs', null)) = 8, 'admin_metric: 주간 강습 등록 수 8주');

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000011","role":"authenticated"}', true);
select throws_ok($$select * from admin_pilot_metrics(false)$$, '42501', null, '본사만');

select * from finish();
rollback;
