-- P21-12 표 직접 권한 (pgTAP). 20261106032439_table_write_revoke.sql 회귀 테스트.
-- Supabase 기본 권한(ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO anon, authenticated)은 새 표를 만들 때
-- anon·authenticated에 INSERT·UPDATE·DELETE·TRUNCATE·REFERENCES·TRIGGER를 직접 준다.
-- RLS가 행 단위 쓰기는 막지만 TRUNCATE는 RLS를 거치지 않는다. anon은 표에 직접 쓰는 경로가 없다(손님 셀프 등록·동의 링크는
-- 서버의 service_role RPC). docs/security/p21-12-analysis.md
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- (1) 일반 검사: public 스키마의 모든 표(일반·파티션)에
--     anon은 INSERT·UPDATE·DELETE·TRUNCATE·REFERENCES·TRIGGER가 없고, authenticated·PUBLIC은 TRUNCATE·REFERENCES·TRIGGER가 없다.
--     PUBLIC은 INSERT·UPDATE·DELETE도 없다(PUBLIC에 주면 anon도 갖게 된다).
--     새 표를 만들면 같은 마이그레이션에서
--       revoke insert, update, delete, truncate, references, trigger on public.<표> from public, anon;
--       revoke truncate, references, trigger on public.<표> from authenticated;
--     를 함께 쓴다. authenticated의 INSERT·UPDATE·DELETE는 RLS 정책이 막으므로 그대로 둔다.
--     정말로 예외가 필요하면 아래 allowed에 '표:역할:권한'과 사유 주석을 더하고 docs/security/p21-12-analysis.md에 적는다
--     (지금은 허용 목록이 비어 있다).
with allowed(entry) as (
  select unnest(array[]::text[])
), rules(role, priv) as (
  select 'anon', p from unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
  union all
  select 'authenticated', p from unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER']) p
  union all
  select 'public', p from unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
), found as (
  select c.relname || ':' || r.role || ':' || r.priv as entry
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join rules r
  where n.nspname = 'public' and c.relkind in ('r', 'p')
    -- INSERT·UPDATE·REFERENCES는 열 단위로도 줄 수 있어 열 권한까지 본다
    and case when r.role = 'public'
             then exists (select 1 from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
                          where a.grantee = 0 and a.privilege_type = r.priv)
               or exists (select 1 from pg_attribute att cross join lateral aclexplode(att.attacl) a
                          where att.attrelid = c.oid and att.attacl is not null and a.grantee = 0 and a.privilege_type = r.priv)
             when r.priv in ('INSERT', 'UPDATE', 'REFERENCES') then has_any_column_privilege(r.role, c.oid, r.priv)
             else has_table_privilege(r.role, c.oid, r.priv) end
)
select is(
  (select coalesce(array_agg(entry order by entry), '{}') from found where entry not in (select entry from allowed)),
  '{}'::text[],
  'public 표에 anon 쓰기·authenticated/PUBLIC TRUNCATE·REFERENCES·TRIGGER 권한이 없다(허용 목록 밖)');
select ok((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p')) >= 40, '검사 대상 표가 있다(빈 목록으로 통과하지 않게)');

-- (2) 과하게 회수하지 않았다: authenticated(또는 public 역할)에 쓰기 정책이 있는 표는 그 명령 권한이 남아 있다
--     INSERT·UPDATE는 열 단위 권한도 인정한다(inquiries는 P22-6에서 UPDATE를 몇 열로만 좁혔다).
with needed as (
  select distinct p.tablename, cmd.c
  from pg_policies p
  cross join lateral unnest(case p.cmd when 'ALL' then array['INSERT', 'UPDATE', 'DELETE'] else array[p.cmd::text] end) as cmd(c)
  where p.schemaname = 'public' and p.cmd <> 'SELECT' and p.roles && array['authenticated', 'public']::name[]
)
select is(
  (select coalesce(array_agg(tablename || ':' || c order by tablename, c), '{}') from needed
   where not case when c = 'DELETE'
                  then has_table_privilege('authenticated', format('public.%I', tablename)::regclass, c)
                  else has_any_column_privilege('authenticated', format('public.%I', tablename)::regclass, c) end),
  '{}'::text[],
  '쓰기 정책이 있는 표의 authenticated INSERT·UPDATE·DELETE 권한은 그대로다');
select ok((select count(*) from pg_policies where schemaname = 'public' and cmd <> 'SELECT') >= 30,
  '쓰기 정책이 있다(빈 목록으로 통과하지 않게)');

-- (3) 읽기는 이 마이그레이션에서 바꾸지 않는다: anon의 resorts·sports SELECT(read_all 정책)는 그대로
select ok(has_table_privilege('anon', 'public.resorts', 'SELECT') and has_table_privilege('anon', 'public.sports', 'SELECT'),
  'anon의 resorts·sports 읽기 권한은 그대로다');

-- (4) 실제 동작: anon·authenticated의 TRUNCATE와 anon의 INSERT는 권한 단계에서 거부된다(RLS까지 가지 않는다)
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$truncate public.resorts$$, '42501', 'permission denied for table resorts', 'anon은 TRUNCATE 불가');
select throws_ok($$insert into public.shops (name, type) values ('[테스트] anon', 'rental_shop')$$,
  '42501', 'permission denied for table shops', 'anon은 INSERT가 권한 단계에서 거부된다');
reset role;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', 'a0000000-0000-0000-0000-000000000022', 'role', 'authenticated')::text, true);
select throws_ok($$truncate public.notifications$$, '42501', 'permission denied for table notifications', '로그인 사용자도 TRUNCATE 불가');
select lives_ok($$select count(*) from public.notifications$$, '로그인 사용자의 읽기는 그대로다');
reset role;

select * from finish();
rollback;
