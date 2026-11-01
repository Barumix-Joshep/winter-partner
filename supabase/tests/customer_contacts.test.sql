-- P12-5 손님 연락 기록과 다음 연락 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000ddd01', 'cc-shop@t', '{"role":"shop_admin","name":"연락샵"}'),
  ('00000000-0000-0000-0000-0000000ddd02', 'cc-other@t', '{"role":"shop_admin","name":"남의샵"}'),
  ('00000000-0000-0000-0000-0000000ddd03', 'cc-inst@t', '{"role":"instructor","name":"연락강사"}');
insert into shops (id, name, status) values
  ('10000000-0000-0000-0000-0000000ddd01', '연락샵', 'approved'),
  ('10000000-0000-0000-0000-0000000ddd02', '남의샵', 'approved');
insert into shop_members (shop_id, user_id, is_owner) values
  ('10000000-0000-0000-0000-0000000ddd01', '00000000-0000-0000-0000-0000000ddd01', true),
  ('10000000-0000-0000-0000-0000000ddd02', '00000000-0000-0000-0000-0000000ddd02', true);
insert into customers (id, shop_id, name, phone, next_contact_on) values
  ('d0000000-0000-0000-0000-0000000ddd01', '10000000-0000-0000-0000-0000000ddd01', '연락손님', '010-1111-2222', '2026-11-20');

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

select pg_temp.login('00000000-0000-0000-0000-0000000ddd02');
select throws_ok($$select log_customer_contact('d0000000-0000-0000-0000-0000000ddd01', 'phone', '안부', null, null)$$, '42501', null, '다른 샵 손님에는 기록할 수 없다');

select pg_temp.login('00000000-0000-0000-0000-0000000ddd01');
select throws_ok($$select log_customer_contact('d0000000-0000-0000-0000-0000000ddd01', 'fax', null, null, null)$$, '22023', null, '연락 방법 확인');
select lives_ok($$select log_customer_contact('d0000000-0000-0000-0000-0000000ddd01', 'phone', '시즌 오픈 안내, 12월 둘째 주 예약 희망', '2026-12-05', '예약 확정 연락')$$, '연락 기록');
select is((select count(*)::int from customer_contacts where customer_id = 'd0000000-0000-0000-0000-0000000ddd01'), 1, '기록 1건');
select is((select (next_contact_on, next_contact_note)::text from customers where id = 'd0000000-0000-0000-0000-0000000ddd01'),
          '(2026-12-05,"예약 확정 연락")', '다음 연락일과 목적이 바뀐다');
select is((select created_by from customer_contacts limit 1), '00000000-0000-0000-0000-0000000ddd01'::uuid, '기록한 사람');
select lives_ok($$select log_customer_contact('d0000000-0000-0000-0000-0000000ddd01', 'visit', null, null, null)$$, '다음 연락 없이 기록');
select is((select next_contact_on from customers where id = 'd0000000-0000-0000-0000-0000000ddd01'), null::date, '다음 연락을 비우면 목록에서 빠진다');

select pg_temp.login('00000000-0000-0000-0000-0000000ddd02');
select is((select count(*)::int from customer_contacts), 0, '다른 샵은 연락 기록을 못 본다');
select pg_temp.login('00000000-0000-0000-0000-0000000ddd03');
select is((select count(*)::int from customer_contacts), 0, '강사는 연락 기록을 못 본다');

select * from finish();
rollback;
