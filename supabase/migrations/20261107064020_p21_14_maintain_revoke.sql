-- 보안 7(DB, P21-14, 위험도 P3): Supabase 기본 권한으로 남은 앱 역할의 관리용 권한을 정리한다. P21-12(표 쓰기)·P21-13(private 함수)의 마지막 단계.
--   1) public 표·뷰의 MAINTAIN(PG17: VACUUM·ANALYZE·REINDEX·REFRESH MATERIALIZED VIEW·CLUSTER·LOCK TABLE)을 anon·authenticated에서 회수.
--      앱 역할은 쓸 일이 없다. 특히 LOCK TABLE은 표 전체를 잠가 다른 사용자의 쓰기를 멈출 수 있다(REST로는 보낼 수 없지만 심층 방어).
--   2) private 스키마 USAGE를 anon에서 회수. anon이 실행할 수 있는 private 함수는 0개다(P21-13). anon에 걸린 정책·화면 중
--      private를 쓰는 것이 없다(resorts·sports 읽기 정책은 `true`, /join·/consent·로그인은 service_role RPC나 Auth API).
--      authenticated·service_role은 정책·검사 제약·뷰에서 private 함수를 부르므로 그대로 둔다.
--   3) public 시퀀스 7개: anon의 남은 SELECT·USAGE 회수(anon은 표 INSERT가 없다, P21-12), authenticated의 SELECT·UPDATE 회수.
--      authenticated의 USAGE(nextval)는 남긴다: resorts·sports는 serial 열이고 본사가 정책(platform_admin_all)으로 직접 추가한다.
--      나머지 5개(access_logs·ai_usage·customer_consents·feedback·ops_events)는 identity 열이라 INSERT에 시퀀스 권한이 필요 없다.
-- 근거·깨질 수 있는 경로: docs/security/p21-14-analysis.md. 회귀 테스트: supabase/tests/maintain_grants.test.sql
-- 영향: 권한만 바꾼다. 데이터 변경 없음. storage·auth 등 Supabase가 관리하는 스키마는 건드리지 않는다.
-- 앞으로: 새 표·뷰·시퀀스도 기본 권한으로 같은 권한이 붙는다. 테스트가 CI에서 잡는다. 새 표·뷰를 만들면 같은 마이그레이션에서
--   revoke maintain on public.<표> from anon, authenticated;
--   (시퀀스) revoke all on sequence public.<시퀀스> from anon; revoke select, update on sequence public.<시퀀스> from authenticated;
--
-- 되돌리기(필요할 때만). 적용 전 상태(2026-11-07 운영 덤프 = 로컬: anon MAINTAIN 표 48·뷰 1, authenticated 표 48·뷰 2)로 돌린다:
--   do $$ declare r record; begin
--     for r in select c.oid::regclass as rel, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
--              where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') loop
--       -- 원래 없던 곳: consult_licenses·consult_plans·consult_usage_packs·shop_channels(둘 다), instructor_assignments(anon만)
--       continue when r.relname in ('consult_licenses', 'consult_plans', 'consult_usage_packs', 'shop_channels');
--       execute format('grant maintain on %s to authenticated', r.rel);
--       continue when r.relname = 'instructor_assignments';
--       execute format('grant maintain on %s to anon', r.rel);
--     end loop;
--   end $$;
--   grant usage on schema private to anon;
--   grant select, usage on all sequences in schema public to anon;
--   grant select, update on all sequences in schema public to authenticated;

do $$
declare
  r record;
begin
  for r in
    select c.oid::regclass as rel from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
  loop
    execute format('revoke maintain on %s from public, anon, authenticated', r.rel);
  end loop;
end $$;

revoke usage on schema private from anon;

revoke all on all sequences in schema public from anon;
revoke select, update on all sequences in schema public from authenticated;
