-- P7-1 손님 카드 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000ccf01', 'cc-s@t', '{"role":"shop_admin","name":"카드샵"}'),
  ('00000000-0000-0000-0000-0000000ccf02', 'cc-s2@t', '{"role":"shop_admin","name":"옆카드샵"}');
insert into shops (id, name, status) values
  ('10000000-0000-0000-0000-0000000ccf01', '카드샵', 'approved'),
  ('10000000-0000-0000-0000-0000000ccf02', '옆카드샵', 'approved');
insert into shop_members (shop_id, user_id, is_owner) values
  ('10000000-0000-0000-0000-0000000ccf01', '00000000-0000-0000-0000-0000000ccf01', true),
  ('10000000-0000-0000-0000-0000000ccf02', '00000000-0000-0000-0000-0000000ccf02', true);
insert into customers (id, shop_id, name) values ('30000000-0000-0000-0000-0000000ccf01', '10000000-0000-0000-0000-0000000ccf01', '카드손님');

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

select pg_temp.login('00000000-0000-0000-0000-0000000ccf01');
select lives_ok($$update customers set memo = '겁이 많음', guardian_name = '박성훈', marketing_consent = true where id = '30000000-0000-0000-0000-0000000ccf01'$$, '메모·보호자·동의를 저장한다');
select ok((select consent_at is not null from customers where id = '30000000-0000-0000-0000-0000000ccf01'), '동의하면 동의 시각이 남는다');
update customers set marketing_consent = false where id = '30000000-0000-0000-0000-0000000ccf01';
select ok((select consent_at is null from customers where id = '30000000-0000-0000-0000-0000000ccf01'), '철회하면 동의 시각을 지운다');

select pg_temp.login('00000000-0000-0000-0000-0000000ccf02');
select is((select count(*) from customers where id = '30000000-0000-0000-0000-0000000ccf01'), 0::bigint, '다른 샵은 손님 카드를 못 본다');
update customers set memo = '침투' where id = '30000000-0000-0000-0000-0000000ccf01';
select pg_temp.login('00000000-0000-0000-0000-0000000ccf01');
select is((select memo from customers where id = '30000000-0000-0000-0000-0000000ccf01'), '겁이 많음', '다른 샵은 고칠 수 없다');

select * from finish();
rollback;
