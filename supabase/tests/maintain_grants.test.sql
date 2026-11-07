-- P21-14 남은 기본 권한 (pgTAP). 20261107064020_p21_14_maintain_revoke.sql 회귀 테스트.
-- Supabase 기본 권한은 새 표·뷰에 anon·authenticated MAINTAIN(PG17: VACUUM·ANALYZE·REINDEX·LOCK TABLE …)을,
-- 새 시퀀스에 anon·authenticated SELECT·UPDATE·USAGE를 준다. 앱 역할은 쓸 일이 없다. docs/security/p21-14-analysis.md
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- (1) 일반 검사: public의 모든 표·뷰(일반·파티션·뷰·구체화 뷰)에 PUBLIC·anon·authenticated MAINTAIN이 없다.
--     새 표·뷰를 만들면 같은 마이그레이션에서 revoke maintain on public.<표> from anon, authenticated;
select is(
  (select coalesce(string_agg(c.relname || ':' || r, ', ' order by c.relname, r), '')
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   cross join unnest(array['anon', 'authenticated']) r
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
     and has_table_privilege(r, c.oid, 'MAINTAIN')),
  '', 'public 표·뷰에 anon·authenticated MAINTAIN 없음');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace,
     aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') and a.grantee = 0 and a.privilege_type = 'MAINTAIN'),
  0, 'public 표·뷰에 PUBLIC MAINTAIN 없음');

-- (2) 일반 검사: public 시퀀스 — anon은 아무 권한 없음, authenticated는 USAGE만(SELECT·UPDATE 없음).
--     새 시퀀스(serial 열)를 만들면 revoke all on sequence … from anon; revoke select, update on sequence … from authenticated;
select is(
  (select coalesce(string_agg(c.relname || ':' || r || ':' || p, ', ' order by c.relname, r, p), '')
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   cross join (values ('anon', 'USAGE'), ('anon', 'SELECT'), ('anon', 'UPDATE'),
                      ('authenticated', 'SELECT'), ('authenticated', 'UPDATE')) x(r, p)
   where n.nspname = 'public' and c.relkind = 'S' and has_sequence_privilege(r, c.oid, p)),
  '', 'public 시퀀스: anon 권한 없음, authenticated SELECT·UPDATE 없음');

-- (3) 본사가 정책으로 직접 추가하는 serial 열 표(resorts·sports)는 nextval이 필요하다 → authenticated USAGE 유지
select ok(has_sequence_privilege('authenticated', 'public.resorts_id_seq', 'USAGE')
          and has_sequence_privilege('authenticated', 'public.sports_id_seq', 'USAGE'),
          'authenticated는 serial 시퀀스 USAGE 유지(본사 스키장·종목 추가)');

-- (4) private 스키마: anon USAGE 없음, authenticated·service_role은 유지(정책·검사 제약·뷰가 private 함수를 부른다)
select ok(not has_schema_privilege('anon', 'private', 'USAGE'), 'anon은 private 스키마 USAGE 없음');
select ok(has_schema_privilege('authenticated', 'private', 'USAGE') and has_schema_privilege('service_role', 'private', 'USAGE'),
          'authenticated·service_role은 private 스키마 USAGE 유지');

-- (5) 실제 동작: anon은 LOCK TABLE을 못 한다(42501)
set local role anon;
select throws_ok($$lock table public.resorts in access exclusive mode$$, '42501', null, 'anon LOCK TABLE → 42501');
reset role;

-- (6) 실제 동작: 본사가 아닌 로그인 사용자의 RLS 조회는 그대로 된다(정책이 private 함수를 부름 — 스키마 USAGE 필요)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f114","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select count(*) from public.jobs$$, 'authenticated RLS 조회(private 정책 함수) 정상');
reset role;

select * from finish();
rollback;
