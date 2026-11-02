-- P6-3 지급 완료 체크 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000eea01', 'pd-a@t', '{"role":"instructor","name":"지급A"}'),
  ('00000000-0000-0000-0000-0000000eef01', 'pd-s@t', '{"role":"shop_admin","name":"지급샵"}'),
  ('00000000-0000-0000-0000-0000000eef02', 'pd-s2@t', '{"role":"shop_admin","name":"옆지급샵"}');
insert into shops (id, name, status) values
  ('10000000-0000-0000-0000-0000000eef01', '지급샵', 'approved'),
  ('10000000-0000-0000-0000-0000000eef02', '옆지급샵', 'approved');
insert into shop_members (shop_id, user_id, is_owner) values
  ('10000000-0000-0000-0000-0000000eef01', '00000000-0000-0000-0000-0000000eef01', true),
  ('10000000-0000-0000-0000-0000000eef02', '00000000-0000-0000-0000-0000000eef02', true);
insert into settlements (id, shop_id, instructor_id, month, gross, withholding, net, status) values
  ('70000000-0000-0000-0000-0000000ee001', '10000000-0000-0000-0000-0000000eef01',
   (select id from instructors where user_id = '00000000-0000-0000-0000-0000000eea01'), '2027-01-01', 100000, 3300, 96700, 'draft');

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

select pg_temp.login('00000000-0000-0000-0000-0000000eef01');
select throws_ok($$select set_settlement_paid('70000000-0000-0000-0000-0000000ee001', true)$$, '22023', null, '발행 전에는 지급 완료로 표시할 수 없다');
select issue_settlements(shop_id, month) from settlements where id = '70000000-0000-0000-0000-0000000ee001'; -- 발행은 RPC로만 (P18-1)
select lives_ok($$select set_settlement_paid('70000000-0000-0000-0000-0000000ee001', true)$$, '지급 완료로 표시');
select is((select status::text || '/' || (paid_at is not null)::text from settlements where id = '70000000-0000-0000-0000-0000000ee001'), 'paid/true', '지급 완료와 시각');
select lives_ok($$select set_settlement_paid('70000000-0000-0000-0000-0000000ee001', false)$$, '잘못 눌렀으면 되돌린다');
select is((select status::text || '/' || (paid_at is null)::text from settlements where id = '70000000-0000-0000-0000-0000000ee001'), 'issued/true', '발행 상태로 돌아간다');
select set_settlement_paid('70000000-0000-0000-0000-0000000ee001', true);

select pg_temp.login('00000000-0000-0000-0000-0000000eef02');
select throws_ok($$select set_settlement_paid('70000000-0000-0000-0000-0000000ee001', false)$$, '42501', null, '다른 샵은 바꿀 수 없다');

select pg_temp.login('00000000-0000-0000-0000-0000000eea01');
select throws_ok($$select set_settlement_paid('70000000-0000-0000-0000-0000000ee001', false)$$, '42501', null, '강사는 바꿀 수 없다');
select ok(exists(select 1 from notifications where kind = 'settlement_paid'), '강사에게 지급 완료 알림');

select * from finish();
rollback;
