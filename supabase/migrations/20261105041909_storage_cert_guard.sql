-- 보안 6(Storage): 본사가 승인한 자격증 파일은 강사가 지우지 못하게 한다.
-- 이전 정책(certs_owner_delete)은 자기 폴더면 무엇이든 지울 수 있어, 승인된 자격증 행은 그대로 둔 채 파일만 지우고
-- 같은 경로에 다른 파일을 올리면(insert는 자기 폴더 허용) 본사가 검증한 증빙이 바뀔 수 있었다. 덮어쓰기(update)는 원래 정책이 없어 막혀 있다.
-- 지울 수 있는 것: 승인 전 자격증 파일, 행이 없는 파일(저장 실패 뒤 정리·자격증 행 삭제 뒤 정리, cert-actions.ts).
-- 데이터는 바꾸지 않는다(정책만).
--
-- 되돌리기: drop policy certs_owner_delete on storage.objects; drop function private.cert_file_locked(text);
--   create policy certs_owner_delete on storage.objects for delete to authenticated
--     using (bucket_id = 'certs' and (storage.foldername(name))[1] = private.my_instructor_id()::text);
--   (이전 정의: 20261101150600_certs.sql)

-- 이 파일을 가리키는 승인된 자격증 행이 있는가 (RLS와 상관없이 본다)
create function private.cert_file_locked(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.instructor_certs c where c.file_url = p_name and c.status = 'approved');
$$;
revoke all on function private.cert_file_locked(text) from public, anon;
grant execute on function private.cert_file_locked(text) to authenticated;

drop policy certs_owner_delete on storage.objects;
create policy certs_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'certs'
         and (storage.foldername(name))[1] = private.my_instructor_id()::text
         and not private.cert_file_locked(name));
