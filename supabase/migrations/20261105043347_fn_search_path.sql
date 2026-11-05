-- 보안 7(DB 함수): search_path를 고정하지 않은 함수 4개를 고정한다 (Security Advisor: function_search_path_mutable).
-- 모두 security invoker이고 표를 참조하지 않아(now·floor·current_setting 같은 기본 함수만) 동작은 같다. 데이터 변경 없음.
--
-- 되돌리기: alter function private.penalty_points_for(timestamptz) reset search_path;
--   alter function private.withholding_amount(integer, boolean) reset search_path;
--   alter function private.consents_immutable() reset search_path;
--   alter function private.access_logs_immutable() reset search_path;

alter function private.penalty_points_for(timestamptz) set search_path = '';
alter function private.withholding_amount(integer, boolean) set search_path = '';
alter function private.consents_immutable() set search_path = '';
alter function private.access_logs_immutable() set search_path = '';
