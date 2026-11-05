-- 보안 7(DB 함수): public·private 함수는 모두 search_path를 고정하고, RLS를 우회하는 public 함수는 anon이 실행하지 못한다 (pgTAP).
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select is(
  (select array_agg(n.nspname || '.' || p.proname order by 1) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prokind = 'f'
     and not coalesce(array_to_string(p.proconfig, ',') ~ 'search_path=', false)
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')),
  null, 'search_path를 고정하지 않은 함수가 없다');

select is(
  (select array_agg(p.proname order by 1) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')),
  null, 'anon은 public의 security definer 함수를 실행하지 못한다');

select is(
  (select array_agg(n.nspname || '.' || p.proname order by 1) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosrc ~* '\mexecute\M\s+(format|''|\$|[a-z_]+\s*\|\|)'),
  null, '동적 SQL(EXECUTE)을 쓰는 함수가 없다');

select * from finish();
rollback;
