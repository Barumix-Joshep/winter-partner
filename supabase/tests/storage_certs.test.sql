-- 보안 6(Storage): 본사가 승인한 자격증 파일은 강사가 지우거나 바꿔치기하지 못한다 (pgTAP).
-- 지우는 것은 승인 전 자격증 파일과, 행이 없는 파일(저장 실패 뒤 정리·자격증 삭제 뒤 정리)만.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- 김스키(c…21) 폴더에 파일 3개: 승인된 자격증, 대기 자격증, 행 없는 파일
insert into storage.objects (bucket_id, name) values
  ('certs', 'c0000000-0000-0000-0000-000000000021/approved.pdf'),
  ('certs', 'c0000000-0000-0000-0000-000000000021/pending.pdf'),
  ('certs', 'c0000000-0000-0000-0000-000000000021/orphan.pdf');
insert into instructor_certs (instructor_id, issuer, status, file_url) values
  ('c0000000-0000-0000-0000-000000000021', '[테스트] 승인 자격증', 'approved', 'c0000000-0000-0000-0000-000000000021/approved.pdf'),
  ('c0000000-0000-0000-0000-000000000021', '[테스트] 대기 자격증', 'pending', 'c0000000-0000-0000-0000-000000000021/pending.pdf');

-- Storage API처럼 삭제 허용 설정을 켜고, 김스키로 지워 본다 (지워진 행 수)
create function pg_temp.del(uid text, obj text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('storage.allow_delete_query', 'true', true);
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  delete from storage.objects where bucket_id = 'certs' and name = obj;
  get diagnostics n = row_count;
  reset role;
  return n;
end $$;

select is(pg_temp.del('a0000000-0000-0000-0000-000000000021', 'c0000000-0000-0000-0000-000000000021/approved.pdf'), 0::bigint, '승인된 자격증 파일은 지우지 못한다');
select ok(exists (select 1 from storage.objects where name = 'c0000000-0000-0000-0000-000000000021/approved.pdf'), '승인된 자격증 파일이 남아 있다');
select is(pg_temp.del('a0000000-0000-0000-0000-000000000021', 'c0000000-0000-0000-0000-000000000021/pending.pdf'), 1::bigint, '승인 전 자격증 파일은 지운다');
select is(pg_temp.del('a0000000-0000-0000-0000-000000000021', 'c0000000-0000-0000-0000-000000000021/orphan.pdf'), 1::bigint, '행이 없는 파일(정리용)은 지운다');
select is(pg_temp.del('a0000000-0000-0000-0000-000000000023', 'c0000000-0000-0000-0000-000000000021/approved.pdf'), 0::bigint, '다른 강사는 남의 파일을 지우지 못한다');

select * from finish();
rollback;
