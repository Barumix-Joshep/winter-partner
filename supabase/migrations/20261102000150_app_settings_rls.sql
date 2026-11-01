-- 설정 테이블도 RLS를 켠다 (정책 없음 = API 역할은 읽기·쓰기 불가). 설정을 읽는 private.setting_int는
-- 테이블 소유자 권한(security definer)으로 돌아 영향이 없다. 값 변경은 DB 관리자가 SQL Editor에서 한다.
alter table private.app_settings enable row level security;
revoke all on private.app_settings from public, anon, authenticated, service_role;
