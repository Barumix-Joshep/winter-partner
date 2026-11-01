-- P3-2 자격증 파일(비공개 버킷)과 본사 검증
-- 파일 경로: certs/<instructor_id>/<파일>. 본인과 플랫폼 관리자만 읽는다.
-- 공개 프로필에는 검증된 자격증의 발급처·등급만 보이고(instructor_certs RLS), 파일은 보이지 않는다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certs', 'certs', false, 4194304, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy certs_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'certs' and (storage.foldername(name))[1] = private.my_instructor_id()::text);
create policy certs_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'certs' and ((storage.foldername(name))[1] = private.my_instructor_id()::text or private.is_platform_admin()));
create policy certs_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'certs' and (storage.foldername(name))[1] = private.my_instructor_id()::text);

-- 본사 검증: 자격증 상태를 바꾸고 강사의 검증 상태(cert_status)를 맞춘다
create function public.review_cert(p_cert_id uuid, p_approve boolean) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  inst uuid;
begin
  if not private.is_platform_admin() then
    raise exception '본사만 자격증을 검증할 수 있습니다' using errcode = '42501';
  end if;

  update public.instructor_certs
  set status = case when p_approve then 'approved' else 'rejected' end::public.approval_status,
      verified_at = now()
  where id = p_cert_id
  returning instructor_id into inst;
  if inst is null then
    raise exception '자격증을 찾을 수 없습니다' using errcode = 'P0002';
  end if;

  update public.instructors i
  set cert_status = case
    when exists (select 1 from public.instructor_certs c where c.instructor_id = inst and c.status = 'approved') then 'approved'
    when exists (select 1 from public.instructor_certs c where c.instructor_id = inst and c.status = 'pending') then 'pending'
    else 'rejected' end::public.approval_status
  where i.id = inst;
end $$;

revoke execute on function public.review_cert(uuid, boolean) from public, anon;
grant execute on function public.review_cert(uuid, boolean) to authenticated;
