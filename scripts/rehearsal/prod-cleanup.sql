-- 운영 테스트 데이터 정리 (docs/test-data-cleanup.md). Supabase SQL Editor(postgres)에서 실행.
-- 실행 전 사장님 확인 필수. 1단계만 먼저 실행해 대상을 확인한다.

-- 1단계: 미리보기 (읽기만) ------------------------------------------------------
with s as (select id, name from public.shops where name like '[테스트]%'),
     u as (select id, email from auth.users where email like '%@winter-partner.test')
select 'shops' as what, count(*) from s
union all select 'accounts', count(*) from u
union all select 'customers', count(*) from public.customers where shop_id in (select id from s)
union all select 'jobs', count(*) from public.jobs where shop_id in (select id from s)
union all select 'settlements', count(*) from public.settlements where shop_id in (select id from s) or payee_shop_id in (select id from s)
union all select 'access_logs', count(*) from public.access_logs where shop_id in (select id from s)
union all select 'ai_usage', count(*) from public.ai_usage where shop_id in (select id from s) or user_id in (select id from u)
union all select 'NOT test shops (must stay)', count(*) from public.shops where name not like '[테스트]%'
union all select 'NOT test accounts (must stay)', count(*) from auth.users where email not like '%@winter-partner.test';

-- 2단계: 삭제 (트랜잭션) — 1단계 결과를 확인한 뒤에만 --------------------------------
/*
begin;
create temp table t_shops on commit drop as select id from public.shops where name like '[테스트]%';
create temp table t_users on commit drop as select id from auth.users where email like '%@winter-partner.test';

-- 접속 기록은 삭제가 막혀 있다: 이 트랜잭션에서만 정리 표시를 켠다
select set_config('app.log_purge', 'on', true);
delete from public.access_logs where shop_id in (select id from t_shops);
select set_config('app.log_purge', 'off', true);

delete from public.ai_usage where shop_id in (select id from t_shops) or user_id in (select id from t_users);
delete from public.settlement_items where settlement_id in (select id from public.settlements where shop_id in (select id from t_shops) or payee_shop_id in (select id from t_shops));
delete from public.settlements where shop_id in (select id from t_shops) or payee_shop_id in (select id from t_shops);
delete from public.notifications where user_id in (select id from t_users);
delete from public.jobs where shop_id in (select id from t_shops);          -- 입찰·배정·의뢰·손님 연결 연쇄
delete from public.shops where id in (select id from t_shops);             -- 손님·동의·연락·링크·멤버 연쇄
delete from auth.users where id in (select id from t_users);              -- 프로필·강사·자격증 행 연쇄

-- 확인: 모두 0이어야 한다
select (select count(*) from public.shops where name like '[테스트]%') as shops,
       (select count(*) from auth.users where email like '%@winter-partner.test') as users,
       (select count(*) from public.customers where name like '[테스트]%') as customers,
       (select count(*) from public.jobs where note like '[테스트]%') as jobs;
-- 0이면: commit;   아니면: rollback;
*/
