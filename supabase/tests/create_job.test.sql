-- P4-1 강습 등록 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000007f1', 'job-shop@t', '{"role":"shop_admin","name":"강습샵"}'),
  ('00000000-0000-0000-0000-0000000007f2', 'job-shop2@t', '{"role":"shop_admin","name":"옆샵"}'),
  ('00000000-0000-0000-0000-0000000007a1', 'job-inst@t', '{"role":"instructor","name":"강습강사"}');
insert into shops (id, name, status) values
  ('10000000-0000-0000-0000-0000000007f1', '강습샵', 'approved'),
  ('10000000-0000-0000-0000-0000000007f2', '옆샵', 'approved');
insert into shop_members (shop_id, user_id, is_owner) values
  ('10000000-0000-0000-0000-0000000007f1', '00000000-0000-0000-0000-0000000007f1', true),
  ('10000000-0000-0000-0000-0000000007f2', '00000000-0000-0000-0000-0000000007f2', true);
insert into shop_resorts values ('10000000-0000-0000-0000-0000000007f1', 1);
insert into customers (id, shop_id, name) values
  ('30000000-0000-0000-0000-0000000007f1', '10000000-0000-0000-0000-0000000007f1', '단골손님'),
  ('30000000-0000-0000-0000-0000000007f2', '10000000-0000-0000-0000-0000000007f2', '옆샵손님');

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

select pg_temp.login('00000000-0000-0000-0000-0000000007f1');

select lives_ok($$select create_job('10000000-0000-0000-0000-0000000007f1', 1, 1, '2026-12-20 10:00+09', '2026-12-20 12:00+09',
  'semi', 2, 220000, 120000, 'shop', '둘 다 처음', null, '{"name":"새손님","phone":"010-0000-9999","level":"입문"}')$$, '새 손님과 함께 강습을 등록한다');
select is((select status::text from jobs where note = '둘 다 처음'), 'draft', '처음에는 임시 저장(draft)');
select is((select customer_price from job_prices p join jobs j on j.id = p.job_id where j.note = '둘 다 처음'), 220000, '손님 강습료는 따로 저장');
select is((select c.name from job_customers jc join customers c on c.id = jc.customer_id join jobs j on j.id = jc.job_id where j.note = '둘 다 처음'),
  '새손님', '새 손님이 샵 손님으로 등록되고 강습에 붙는다');
select lives_ok($$select create_job('10000000-0000-0000-0000-0000000007f1', 1, 2, '2026-12-21 10:00+09', '2026-12-21 12:00+09',
  'private', 1, null, null, null, '단골', '30000000-0000-0000-0000-0000000007f1', null)$$, '기존 손님으로 등록한다');
select throws_ok($$select create_job('10000000-0000-0000-0000-0000000007f1', 1, 1, '2026-12-21 10:00+09', '2026-12-21 12:00+09',
  'private', 1, null, null, null, null, '30000000-0000-0000-0000-0000000007f2', null)$$, '22023', null, '다른 샵 손님은 쓸 수 없다');
select throws_ok($$select create_job('10000000-0000-0000-0000-0000000007f1', 5, 1, '2026-12-21 10:00+09', '2026-12-21 12:00+09',
  'private', 1, null, null, null, null, null, null)$$, '22023', null, '영업 스키장이 아니면 등록할 수 없다');
select throws_ok($$select create_job('10000000-0000-0000-0000-0000000007f1', 1, 1, '2026-12-21 10:00+09', '2026-12-21 12:00+09',
  'private', 1, null, null, 'nobody', null, null, null)$$, '22023', null, '패치 구매 주체는 샵·강사·손님 중 하나');

select pg_temp.login('00000000-0000-0000-0000-0000000007f2');
select throws_ok($$select create_job('10000000-0000-0000-0000-0000000007f1', 1, 1, '2026-12-21 10:00+09', '2026-12-21 12:00+09',
  'private', 1, null, null, null, null, null, null)$$, '42501', null, '다른 샵 이름으로 등록할 수 없다');

select pg_temp.login('00000000-0000-0000-0000-0000000007a1');
select throws_ok($$select create_job('10000000-0000-0000-0000-0000000007f1', 1, 1, '2026-12-21 10:00+09', '2026-12-21 12:00+09',
  'private', 1, null, null, null, null, null, null)$$, '42501', null, '강사는 강습을 등록할 수 없다');

select * from finish();
rollback;
