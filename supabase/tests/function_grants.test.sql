-- P21-13 함수 실행 권한 (pgTAP). public 스키마의 모든 함수(security definer·invoker·트리거 함수 모두)를 본다.
-- Supabase 기본 권한(ALTER DEFAULT PRIVILEGES)은 public에 새 함수를 만들면 anon·authenticated에 EXECUTE를 직접 주고,
-- Postgres 기본값으로 PUBLIC에도 EXECUTE가 남는다. 그래서 새 함수를 만들면 같은 마이그레이션에서
--   revoke execute on function public.<함수>(<인자 타입>) from public, anon;
-- 를 함께 쓴다(로그인 사용자가 부르는 RPC면 이어서 `grant execute … to authenticated`).
-- db_functions.test.sql의 anon 검사는 security definer 함수만 보므로, 이 파일이 invoker 함수와 PUBLIC 부여까지 넓혀 본다.
-- 정말로 anon(로그인 전 화면)이 불러야 하는 함수가 생기면 아래 allowed에 '함수(인자 타입)'와 사유 주석을 더하고
-- docs/security/checklist.md 7번에 예외로 적는다. 지금은 허용 목록이 비어 있다 — 손님 셀프 등록·동의 링크도
-- 서버(service_role) 경로라 anon 실행 함수가 없다(2026-11-06 로컬·운영 점검 0개).
-- 확장(extension)이 만든 함수는 확장이 권한을 관리하므로 제외한다(pg_depend deptype 'e', 지금 public에는 0개).
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

with allowed(entry) as (
  select unnest(array[]::text[])
), fns as (
  select p.oid, p.oid::regprocedure::text as entry, p.proacl, p.proowner
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and not exists (select 1 from pg_depend d
                    where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
), found as (
  select entry || ':anon' as entry from fns where has_function_privilege('anon', oid, 'EXECUTE')
  union all
  select entry || ':PUBLIC' from fns
  where exists (select 1 from aclexplode(coalesce(proacl, acldefault('f', proowner))) a
                where a.grantee = 0 and a.privilege_type = 'EXECUTE')
)
select is(
  (select coalesce(array_agg(entry order by entry), '{}') from found
   where split_part(entry, ':', 1) not in (select entry from allowed)),
  '{}'::text[],
  'public 함수에 anon·PUBLIC 실행 권한이 없다(허용 목록 밖)');

-- 빈 목록으로 통과하지 않게: 검사 대상 함수가 충분히 있다(2026-11-06 기준 84개)
select ok((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and not exists (select 1 from pg_depend d
                             where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')) >= 50,
  '검사 대상 public 함수가 있다');

-- 검사 자체가 동작하는지: 이 트랜잭션에서 회수하지 않은 함수를 만들면 위 조건에 잡힌다(되돌림)
create function public.p21_13_probe() returns int language sql set search_path = '' as $$ select 1 $$;
select ok(has_function_privilege('anon', 'public.p21_13_probe()', 'EXECUTE')
          and exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                      where p.oid = 'public.p21_13_probe()'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  '회수하지 않은 새 함수는 anon·PUBLIC 실행 가능으로 잡힌다(검사 조건 확인)');

select * from finish();
rollback;
