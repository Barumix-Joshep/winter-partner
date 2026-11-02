-- P14-3 자격증 AI 판독값 (참고용). 승인은 본사가 사람 눈으로 한다(review_cert 그대로).
-- 판독값은 서버(service_role)만 쓴다: 강사가 고칠 수 없게 트리거로 막는다.
alter table instructor_certs add column ai_extract jsonb;
alter table instructor_certs add column ai_extract_at timestamptz;

create function private.guard_cert_ai() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not private.is_platform_admin()
     and (new.ai_extract is distinct from old.ai_extract or new.ai_extract_at is distinct from old.ai_extract_at) then
    raise exception 'AI 판독값은 고칠 수 없습니다' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_cert_ai before update on instructor_certs
  for each row execute function private.guard_cert_ai();

-- 강사가 새로 올리는 행에 판독값을 넣을 수도 없다
create function private.guard_cert_ai_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and (new.ai_extract is not null or new.ai_extract_at is not null) then
    raise exception 'AI 판독값은 넣을 수 없습니다' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_cert_ai_insert before insert on instructor_certs
  for each row execute function private.guard_cert_ai_insert();

create function public.save_cert_extract(p_cert_id uuid, p_extract jsonb)
returns void language sql security definer set search_path = '' as $$
  update public.instructor_certs set ai_extract = p_extract, ai_extract_at = now() where id = p_cert_id
$$;
revoke execute on function public.save_cert_extract(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_cert_extract(uuid, jsonb) to service_role;
