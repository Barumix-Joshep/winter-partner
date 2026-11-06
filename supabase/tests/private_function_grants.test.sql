-- P21-13 private 함수 실행 권한·public 시퀀스 권한 (pgTAP). 20261106055522_private_fn_revoke.sql 회귀 테스트.
-- PostgreSQL은 함수를 만들면 PUBLIC에 EXECUTE를 준다. private 스키마는 API(PostgREST)에 열려 있지 않지만,
-- anon·authenticated 모두 스키마 USAGE가 있어 정책·뷰·invoker 함수를 거치면 부를 수 있다. 그래서
--   - anon·PUBLIC은 private 함수를 하나도 실행하지 못한다.
--   - authenticated는 자기 권한으로 부르는 곳(RLS 정책·검사 제약·security_invoker 뷰·invoker 함수)이 있는 함수만 실행한다.
--     어디서 쓰는지는 카탈로그(pg_depend·뷰 정의·함수 본문)에서 뽑아 아래 allowed와 맞춘다.
-- 새 private 함수를 만들면 같은 마이그레이션에서 revoke execute on function private.<함수>(…) from public; 을 쓰고,
-- 정책 등에서 쓰면 grant … to authenticated, 서버(service_role)가 직접 쓰면 grant … to service_role 을 더한다.
-- docs/security/p21-13-analysis.md
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- (1) anon·PUBLIC 실행 0
select is(
  (select coalesce(array_agg(p.oid::regprocedure::text || ':' || r order by 1), '{}')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   cross join unnest(array['anon', 'PUBLIC']) r
   where n.nspname = 'private'
     and case when r = 'anon' then has_function_privilege('anon', p.oid, 'EXECUTE')
              else exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                           where a.grantee = 0 and a.privilege_type = 'EXECUTE') end),
  '{}'::text[],
  'private 함수에 anon·PUBLIC 실행 권한이 없다');

-- (2) authenticated 실행 함수 = 허용 목록(26개). 늘리거나 줄이면 이 목록과 사유를 함께 고친다.
select set_eq(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'EXECUTE') $$,
  $$ values
     -- RLS 정책(public 표·storage.objects)
     ('private.is_platform_admin()'), ('private.is_shop_member(uuid)'), ('private.is_shop_owner(uuid)'),
     ('private.is_any_shop_member()'), ('private.shares_shop(uuid)'), ('private.is_lesson_team_member()'),
     ('private.is_lesson_team(uuid)'), ('private.my_instructor_id()'), ('private.is_instructor_user(uuid)'),
     ('private.is_exclusive()'), ('private.job_shop_id(uuid)'), ('private.job_open_for_bids(uuid,boolean)'),
     ('private.is_assigned(uuid)'), ('private.has_job_link(uuid)'), ('private.customer_shop_id(uuid)'),
     ('private.can_see_settlement(uuid)'), ('private.is_exclusive_instructor(uuid)'), ('private.is_approved_shop(uuid)'),
     ('private.cert_file_locked(text)'), ('private.cert_folder_has_room(text)'),
     -- 검사 제약
     ('private.is_encrypted(text)'), ('private.is_hmac(text)'),
     -- security_invoker 뷰 customer_consent_state, require_guardian 트리거
     ('private.is_minor(integer)'), ('private.setting_int(text)'),
     -- invoker 함수 create_job·revisit_candidates
     ('private.check_won(integer,text,integer)'), ('private.season_of(timestamp with time zone)') $$,
  'authenticated는 허용 목록의 private 함수만 실행한다');

-- (3) 일반 검사: authenticated·PUBLIC에 걸린 RLS 정책이 부르는 private 함수는 모두 authenticated가 실행할 수 있다(스키마 무관)
select is(
  (select coalesce(array_agg(distinct p.oid::regprocedure::text), '{}')
   from pg_policy pol
   join pg_depend d on d.classid = 'pg_policy'::regclass and d.objid = pol.oid and d.refclassid = 'pg_proc'::regclass
   join pg_proc p on p.oid = d.refobjid join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and (0 = any(pol.polroles) or 'authenticated'::regrole = any(pol.polroles))
     and not has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  '{}'::text[],
  'RLS 정책이 부르는 private 함수는 authenticated가 실행할 수 있다');

-- (4) 일반 검사: public 표 검사 제약·security_invoker 뷰가 부르는 private 함수도 authenticated가 실행할 수 있다
select is(
  (select coalesce(array_agg(distinct p.oid::regprocedure::text), '{}')
   from pg_depend d
   join pg_proc p on d.refclassid = 'pg_proc'::regclass and p.oid = d.refobjid
   join pg_namespace n on n.oid = p.pronamespace
   left join pg_constraint con on d.classid = 'pg_constraint'::regclass and con.oid = d.objid
   left join pg_rewrite rw on d.classid = 'pg_rewrite'::regclass and rw.oid = d.objid
   left join pg_class v on v.oid = rw.ev_class
   where n.nspname = 'private'
     and (con.oid is not null or (v.oid is not null and v.relkind = 'v'))
     and not has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  '{}'::text[],
  '검사 제약·뷰가 부르는 private 함수는 authenticated가 실행할 수 있다');

-- (5) service_role(서버: 웹훅·RPC 밖 직접 쓰기)도 검사 제약이 부르는 private 함수를 실행할 수 있다
select is(
  (select coalesce(array_agg(distinct p.oid::regprocedure::text), '{}')
   from pg_constraint con
   join pg_depend d on d.classid = 'pg_constraint'::regclass and d.objid = con.oid and d.refclassid = 'pg_proc'::regclass
   join pg_proc p on p.oid = d.refobjid join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and not has_function_privilege('service_role', p.oid, 'EXECUTE')),
  '{}'::text[],
  '검사 제약이 부르는 private 함수는 service_role도 실행할 수 있다');

-- (6) 빈 목록으로 통과하지 않게: 검사 대상 private 함수가 충분히 있다(2026-11-06 기준 87개)
select ok((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private') >= 60,
  '검사 대상 private 함수가 있다');

-- (7) public 시퀀스에 anon UPDATE(setval)가 없다
select is(
  (select coalesce(array_agg(c.relname::text order by 1), '{}') from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'S'
     and case when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, 'UPDATE') else false end),
  '{}'::text[],
  'public 시퀀스에 anon UPDATE가 없다');

-- (8) 동작: anon은 private 함수를 부를 수 없다
set local role anon;
select throws_ok($$ select private.is_platform_admin() $$, '42501', null, 'anon은 private.is_platform_admin()을 부를 수 없다');
reset role;

-- (9) 동작: 로그인 사용자는 정책용 함수는 부르지만, 서버 전용 함수(본사 알림 만들기)는 못 부른다
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d113","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$ select private.notify_platform_admins('p21_13_probe', '{}'::jsonb) $$, '42501', null,
  '로그인 사용자는 private.notify_platform_admins를 부를 수 없다');
select is(private.is_platform_admin(), false, '로그인 사용자는 정책용 private.is_platform_admin()을 부를 수 있다');
reset role;

select * from finish();
rollback;
