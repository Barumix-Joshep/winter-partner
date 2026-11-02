-- 서버 권한(service_role)으로 손님 행을 쓰면 트리거(require_guardian → private.is_minor 등)가
-- "permission denied for schema private"로 실패하던 문제. private 스키마 사용 권한만 준다.
-- (실행 권한을 회수한 함수 — grant_platform_admin, anonymize_customer 등 — 은 그대로 막혀 있다)
grant usage on schema private to service_role;
