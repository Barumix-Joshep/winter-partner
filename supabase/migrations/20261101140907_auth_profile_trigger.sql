-- P2-1 가입하면 프로필을 만든다.
-- 이메일 가입은 메타데이터 {role, name}을 넘긴다. 인증 메일 확인 전에는 세션이 없어
-- 앱이 직접 profiles에 넣을 수 없으므로 auth.users 트리거에서 만든다.
-- 역할이 없거나(카카오 등 OAuth) 허용되지 않은 값이면 만들지 않는다 → 첫 로그인 때 고르게 한다(P2-2).
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r text := new.raw_user_meta_data ->> 'role';
  n text := nullif(btrim(new.raw_user_meta_data ->> 'name'), '');
begin
  if r is null or r not in ('shop_admin', 'instructor') then
    return new;
  end if;
  insert into public.profiles (id, role, name)
  values (new.id, r::public.user_role, coalesce(n, split_part(new.email, '@', 1)));
  if r = 'instructor' then
    insert into public.instructors (user_id) values (new.id);
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();
