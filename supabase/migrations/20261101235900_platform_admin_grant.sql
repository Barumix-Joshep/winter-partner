-- P12-1 첫 플랫폼 관리자 지정
-- 가입으로는 platform_admin이 될 수 없다(handle_new_user). 첫 관리자는 DB 관리자(postgres)가
-- Supabase 대시보드 SQL Editor에서 이 함수를 직접 불러 지정한다:
--   select private.grant_platform_admin('<가입한 이메일>');
-- 앱·API(anon, authenticated, service_role)는 실행할 수 없다: private 스키마는 PostgREST에 노출되지 않고,
-- 실행 권한도 모두 회수한다. 이메일은 저장소에 남기지 않는다(이 파일에는 함수만).
create function private.grant_platform_admin(p_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  cur public.user_role;
begin
  select u.id into uid from auth.users u
  where lower(u.email) = lower(btrim(p_email)) and u.email_confirmed_at is not null;
  if uid is null then
    raise exception '이메일 인증을 마친 가입 계정이 없습니다: %', p_email using errcode = '22023';
  end if;
  select role into cur from public.profiles where id = uid;
  if cur is null then
    raise exception '프로필이 없습니다 (가입이 끝나지 않음)' using errcode = '22023';
  end if;
  -- 강사·샵 데이터가 묶인 계정은 바꾸지 않는다 (관리자 전용 계정을 따로 가입해 지정)
  if exists (select 1 from public.instructors where user_id = uid)
     or exists (select 1 from public.shop_members where user_id = uid) then
    raise exception '강사나 샵에 연결된 계정입니다. 관리자 전용 계정으로 가입해 주세요' using errcode = '22023';
  end if;

  perform set_config('app.system_write', 'on', true);  -- 역할 열 보호 트리거(guard_admin_columns) 통과
  update public.profiles set role = 'platform_admin' where id = uid;
  perform set_config('app.system_write', 'off', true);
  raise log 'grant_platform_admin: % (%) % -> platform_admin by %', uid, p_email, cur, current_user;
  return uid;
end $$;

revoke all on function private.grant_platform_admin(text) from public, anon, authenticated, service_role;
