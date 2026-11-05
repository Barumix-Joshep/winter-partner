-- P21-11 뷰 쓰기 권한 (pgTAP). 20261105230951_view_write_revoke.sql 회귀 테스트.
-- Supabase 기본 권한은 새 뷰를 만들 때 anon·authenticated에 INSERT·UPDATE·DELETE 등을 직접 준다.
-- `revoke … from public`만으로는 안 지워지고, 소유자 권한 뷰는 쓰기 때 표의 RLS를 건너뛴다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- (1) 일반 검사: public 스키마의 모든 뷰·머티리얼라이즈드 뷰에 anon·authenticated(그리고 PUBLIC)의 쓰기 권한이 없다.
--     새 뷰를 만들면 같은 마이그레이션에서
--       revoke insert, update, delete, truncate, references, trigger on public.<뷰> from public, anon, authenticated;
--     를 함께 쓴다. 정말로 뷰 쓰기를 허용해야 하면 아래 allowed에 '뷰:역할:권한'과 사유 주석을 더하고
--     docs/security/checklist.md 7번에 예외로 적는다(지금은 허용 목록이 비어 있다).
with allowed(entry) as (
  select unnest(array[]::text[])
), found as (
  select c.relname || ':' || r.role || ':' || p.priv as entry
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join unnest(array['anon', 'authenticated', 'public']) as r(role)
  cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p(priv)
  where n.nspname = 'public' and c.relkind in ('v', 'm')
    and case when r.role = 'public'
             then exists (select 1 from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
                          where a.grantee = 0 and a.privilege_type = p.priv)
             else has_table_privilege(r.role, c.oid, p.priv) end
)
select is(
  (select coalesce(array_agg(entry order by entry), '{}') from found where entry not in (select entry from allowed)),
  '{}'::text[],
  'public 뷰에 anon·authenticated·PUBLIC 쓰기 권한이 없다(허용 목록 밖)');
select ok((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('v', 'm')) >= 2, '검사 대상 뷰가 있다(빈 목록으로 통과하지 않게)');

-- (2) 강사는 instructor_assignments로 쓰지 못하고, 읽기는 그대로다
create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- 이보드(c…022)의 미승인 직접 배정 1건, 박스키(c…023)가 팀(평창 라이딩스쿨)으로 맡은 강습 1건
insert into shop_instructors (shop_id, instructor_id) values ('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000023');
insert into jobs (id, shop_id, resort_id, starts_at, ends_at, lesson_type, student_count, instructor_rate, status, assign_mode) values
  ('e0000000-0000-0000-0000-000000021101', 'b0000000-0000-0000-0000-000000000002', (select id from resorts where name = '용평'),
   '2027-01-22 10:00+09', '2027-01-22 12:00+09', 'private', 1, 90000, 'assigned', 'bid'),
  ('e0000000-0000-0000-0000-000000021102', 'b0000000-0000-0000-0000-000000000002', (select id from resorts where name = '용평'),
   '2027-01-23 10:00+09', '2027-01-23 12:00+09', 'group', 3, 200000, 'assigned', 'bid'),
  ('e0000000-0000-0000-0000-000000021103', 'b0000000-0000-0000-0000-000000000002', (select id from resorts where name = '용평'),
   '2027-01-24 10:00+09', '2027-01-24 12:00+09', 'private', 1, 90000, 'open', 'bid');
select set_config('app.system_write', 'on', true);
insert into assignments (id, job_id, instructor_id, via_shop_id, final_rate) values
  ('f2110000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000021101', 'c0000000-0000-0000-0000-000000000022', null, 90000),
  ('f2110000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000021102', 'c0000000-0000-0000-0000-000000000023', 'b0000000-0000-0000-0000-000000000003', 185000);
select set_config('app.system_write', 'off', true);

select pg_temp.login('a0000000-0000-0000-0000-000000000022'); -- 이보드
select throws_ok($$delete from instructor_assignments where id = 'f2110000-0000-0000-0000-000000000001'$$,
  '42501', null, '강사는 뷰로 자기 미승인 배정을 지울 수 없다');
select throws_ok($$update instructor_assignments set lesson_note = '[테스트] 메모', completed_at = now() where id = 'f2110000-0000-0000-0000-000000000001'$$,
  '42501', null, '강사는 뷰로 완료 시각·노트를 고칠 수 없다(표 RLS·RPC 경로로만)');
select throws_ok($$insert into instructor_assignments (job_id, instructor_id) values ('e0000000-0000-0000-0000-000000021103', 'c0000000-0000-0000-0000-000000000022')$$,
  '42501', null, '강사는 뷰로 배정을 만들 수 없다');
select is((select array_agg(final_rate) from instructor_assignments where job_id = 'e0000000-0000-0000-0000-000000021101'), array[90000],
  '읽기는 그대로: 자기 직접 배정과 금액이 보인다');
reset role;

select pg_temp.login('a0000000-0000-0000-0000-000000000023'); -- 박스키(팀원)
select throws_ok($$delete from instructor_assignments where id = 'f2110000-0000-0000-0000-000000000002'$$,
  '42501', null, '팀원은 뷰로 팀 강습 배정을 지울 수 없다');
select is((select count(*) from instructor_assignments where job_id = 'e0000000-0000-0000-0000-000000021102' and final_rate is null), 1::bigint,
  '읽기는 그대로: 팀 강습은 보이고 금액은 비어 있다');
reset role;

select is((select count(*) from assignments where id::text like 'f2110000%'), 2::bigint, '배정 행은 그대로 남아 있다');

select * from finish();
rollback;
