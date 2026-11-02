-- P13-5 접속 기록: 자기 샵만, 고치거나 지울 수 없음, 보관 기간 정리 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000033301', 'al-shop@t', '{"role":"shop_admin","name":"기록샵장"}'),
  ('00000000-0000-0000-0000-000000033302', 'al-other@t', '{"role":"shop_admin","name":"남의샵장"}'),
  ('00000000-0000-0000-0000-000000033303', 'al-inst@t', '{"role":"instructor","name":"기록강사"}');
insert into shops (id, name, status) values
  ('10000000-0000-0000-0000-000000033301', '기록샵', 'approved'),
  ('10000000-0000-0000-0000-000000033302', '남의샵', 'approved');
insert into shop_members (shop_id, user_id, is_owner) values
  ('10000000-0000-0000-0000-000000033301', '00000000-0000-0000-0000-000000033301', true),
  ('10000000-0000-0000-0000-000000033302', '00000000-0000-0000-0000-000000033302', true);
insert into settlements (id, shop_id, instructor_id, month, gross, withholding, net, status)
select '50000000-0000-0000-0000-000000033301', '10000000-0000-0000-0000-000000033301', i.id, '2026-11-01', 100000, 3300, 96700, 'issued'
from instructors i where i.user_id = '00000000-0000-0000-0000-000000033303';

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

select pg_temp.login('00000000-0000-0000-0000-000000033301');
select lives_ok($$select log_access('customer_view', '10000000-0000-0000-0000-000000033301', gen_random_uuid())$$, '샵 멤버가 손님 열람 기록');
select lives_ok($$select log_access('settlement_export', '10000000-0000-0000-0000-000000033301', null, '{"month":"2026-11"}')$$, '엑셀 다운로드 기록');
select pg_temp.login('00000000-0000-0000-0000-000000033303');
select lives_ok($$select log_access('settlement_pdf', '10000000-0000-0000-0000-000000033301', '50000000-0000-0000-0000-000000033301')$$, '받는 강사의 PDF 열람 기록');
select throws_ok($$select log_access('customer_view', '10000000-0000-0000-0000-000000033301', null)$$, '42501', null, '강사는 손님 열람 기록을 남길 수 없다');
select pg_temp.login('00000000-0000-0000-0000-000000033302');
select throws_ok($$select log_access('customer_view', '10000000-0000-0000-0000-000000033301', null)$$, '42501', null, '다른 샵으로 기록할 수 없다');
select is((select count(*)::int from access_logs), 0, '다른 샵 기록은 안 보인다');

select pg_temp.login('00000000-0000-0000-0000-000000033301');
select is((select array_agg(action order by id) from access_logs), array['customer_view', 'settlement_export', 'settlement_pdf'], '자기 샵 기록 3건 (누가 열었는지 포함)');
reset role;
select set_config('request.jwt.claims', '', true);
select throws_ok($$update access_logs set action = 'customer_export'$$, '42501', null, '관리자도 고칠 수 없다');
select throws_ok($$delete from access_logs$$, '42501', null, '관리자도 지울 수 없다');

-- 보관 기간 지난 기록만 정리
alter table access_logs disable trigger access_logs_immutable;
update access_logs set created_at = now() - interval '3 years' where action = 'customer_view';
alter table access_logs enable trigger access_logs_immutable;
select is(purge_access_logs(), 1, '2년 지난 기록 1건 정리');
select is((select count(*)::int from access_logs), 2, '나머지는 남는다');

select * from finish();
rollback;
