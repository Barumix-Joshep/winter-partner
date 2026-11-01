-- P3-2 자격증 업로드와 본사 검증 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000004a1', 'cert-inst@t', '{"role":"instructor","name":"자격강사"}'),
  ('00000000-0000-0000-0000-0000000004a2', 'cert-shop@t', '{"role":"shop_admin","name":"자격샵"}'),
  ('00000000-0000-0000-0000-0000000004a3', 'cert-other@t', '{"role":"instructor","name":"남의강사"}');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000004aa', 'cert-admin@t');
insert into profiles (id, role, name) values ('00000000-0000-0000-0000-0000000004aa', 'platform_admin', '본사');

create temp table ids as select id as inst from instructors where user_id = '00000000-0000-0000-0000-0000000004a1';
grant select on ids to authenticated;
select ok(exists(select 1 from storage.buckets where id = 'certs' and not public), '자격증 버킷은 비공개');

-- 강사 본인
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000004a1","role":"authenticated"}', true);
select lives_ok($$insert into storage.objects (bucket_id, name) select 'certs', inst || '/ksia.pdf' from ids$$, '자기 폴더에 올린다');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('certs', 'someone-else/ksia.pdf')$$, '42501', null, '남의 폴더에는 못 올린다');
select lives_ok($$insert into instructor_certs (instructor_id, issuer, grade, file_url) select inst, 'KSIA', 'Level 1', inst || '/ksia.pdf' from ids$$, '자격증을 등록한다');
select throws_ok($$select review_cert((select id from instructor_certs limit 1), true)$$, '42501', null, '강사는 스스로 승인하지 못한다');

-- 다른 사람은 파일을 못 본다
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000004a2","role":"authenticated"}', true);
select is((select count(*) from storage.objects where bucket_id = 'certs'), 0::bigint, '샵은 자격증 파일을 못 본다');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000004a3","role":"authenticated"}', true);
select is((select count(*) from storage.objects where bucket_id = 'certs'), 0::bigint, '다른 강사도 못 본다');

-- 본사 승인
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000004aa","role":"authenticated"}', true);
select is((select count(*) from storage.objects where bucket_id = 'certs'), 1::bigint, '본사는 검증용으로 파일을 본다');
select lives_ok($$select review_cert((select c.id from instructor_certs c join ids on c.instructor_id = ids.inst), true)$$, '본사가 승인한다');
select is((select cert_status::text from instructors where id = (select inst from ids)), 'approved', '승인되면 강사 검증 상태도 승인');

select * from finish();
rollback;
