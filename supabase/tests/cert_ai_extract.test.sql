-- P14-3 자격증 AI 판독값: 서버만 쓰고 강사는 못 고친다 (pgTAP)
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000066601', 'ce-inst@t', '{"role":"instructor","name":"판독강사"}');
insert into instructor_certs (id, instructor_id, issuer, grade)
select '70000000-0000-0000-0000-000000066601', id, 'KSIA', 'Level 2' from instructors where user_id = '00000000-0000-0000-0000-000000066601';

select lives_ok($$select save_cert_extract('70000000-0000-0000-0000-000000066601', '{"issuer":"KSIA","grade":"Level 2","holder_name":"판독강사"}')$$, '서버가 판독값 저장');
select ok((select ai_extract_at is not null from instructor_certs where id = '70000000-0000-0000-0000-000000066601'), '판독 시각');

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000066601","role":"authenticated"}', true);
-- P18-3부터 강사는 자격증 행을 직접 고칠 수 없다(수정 정책 없음): 오류 대신 0행이 바뀐다
update instructor_certs set ai_extract = '{"grade":"Level 3"}' where id = '70000000-0000-0000-0000-000000066601';
select is((select count(*) from instructor_certs where id = '70000000-0000-0000-0000-000000066601' and ai_extract ->> 'grade' = 'Level 3'), 0::bigint, '강사는 판독값을 고칠 수 없다');
select throws_ok($$insert into instructor_certs (instructor_id, issuer, ai_extract) values (private.my_instructor_id(), 'KSIA', '{"x":1}')$$, '42501', null, '강사는 판독값을 넣을 수 없다');
select throws_ok($$select save_cert_extract('70000000-0000-0000-0000-000000066601', '{}')$$, '42501', null, '로그인 사용자는 저장 함수를 못 부른다');

select * from finish();
rollback;
