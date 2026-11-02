-- P18-3 역할별 RLS 자동 점검 (pgTAP). 표는 scripts/ops/rls-matrix.sql로 뽑아 docs/simulation-report.md에 남긴다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- 1) public의 모든 표에 RLS가 켜져 있다
select is(
  (select array_agg(c.relname order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  null, '모든 표에 RLS');

-- 2) anon·public에 쓰기 정책이 없다
select is(
  (select array_agg(tablename || ':' || policyname) from pg_policies
   where schemaname = 'public' and cmd <> 'SELECT' and (roles && array['anon', 'public']::name[])),
  null, 'anon·public 쓰기 정책 없음');

-- 3) 로그인 사용자 누구에게나 열린 쓰기 정책(using true / check true)이 없다
select is(
  (select array_agg(tablename || ':' || policyname) from pg_policies
   where schemaname = 'public' and cmd <> 'SELECT' and (qual = 'true' or with_check = 'true')),
  null, '조건 없는 쓰기 정책 없음');

-- 역할별로 볼 수 있는 행 수: 볼 수 없어야 하는 데 보이면 "표:개수"로 모은다
create function pg_temp.leaks(uid text, tables text[], shop uuid) returns text[] language plpgsql as $$
declare t text; n bigint; out text[] := '{}';
begin
  if uid is null then
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  else
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  end if;
  foreach t in array tables loop
    begin
      if shop is null then
        execute format('select count(*) from public.%I', t) into n;
      else
        execute format('select count(*) from public.%I where shop_id = $1', t) into n using shop;
      end if;
    exception when insufficient_privilege then n := 0;
    end;
    if n > 0 then out := out || (t || ':' || n); end if;
  end loop;
  reset role;
  return out;
end $$;

-- 4) anon은 기준 정보(스키장·종목) 말고는 아무것도 못 본다
select is(pg_temp.leaks(null, array(
  select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname not in ('resorts', 'sports')), null), '{}'::text[], 'anon은 기준 정보만');

-- 하이원 스노우렌탈(shop1) 데이터에 데모 기록을 하나씩 만든다 (빈 표로 통과하지 않게)
insert into customer_contacts (shop_id, customer_id, channel, memo) values ('b0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'phone', '연락');
insert into health_warnings (shop_id, customer_id, field, terms) select 'b0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'customer_memo', array['허리'];
insert into ai_usage (shop_id, feature, model, cost_krw, ok) values ('b0000000-0000-0000-0000-000000000001', 'intake', 'm', 1, true);

-- 샵 자료: 손님·연락·동의·건강 경고·링크·접속 기록·삭제 기록·AI 사용·문의·전속 초대·정산 (샵 멤버만)
create temp table shop_only (t text);
insert into shop_only values ('customers'), ('customer_contacts'), ('customer_consents'), ('health_warnings'), ('consent_links'), ('registration_links'),
  ('access_logs'), ('customer_erasures'), ('ai_usage'), ('inquiries'), ('exclusive_invites'), ('settlements');
grant select on shop_only to anon, authenticated;
select ok((select count(*) from customers where shop_id = 'b0000000-0000-0000-0000-000000000001') > 0, '점검 대상 데이터가 있다');

-- 5~8) 다른 샵·프리랜서·다른 샵 전속·강습팀은 shop1 자료를 못 본다
select is(pg_temp.leaks('a0000000-0000-0000-0000-000000000012', array(select t from shop_only), 'b0000000-0000-0000-0000-000000000001'), '{}'::text[], '다른 샵(용평 알파인샵)');
select is(pg_temp.leaks('a0000000-0000-0000-0000-000000000021', array(select t from shop_only), 'b0000000-0000-0000-0000-000000000001'), '{}'::text[], '프리랜서 강사(김스키, shop1 강습 배정됨)');
select is(pg_temp.leaks('a0000000-0000-0000-0000-000000000013', array(select t from shop_only), 'b0000000-0000-0000-0000-000000000001'), '{}'::text[], '강습팀(평창 라이딩스쿨)');

select * from finish();
rollback;
