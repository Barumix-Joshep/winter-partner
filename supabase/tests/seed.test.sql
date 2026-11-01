-- P1-3 시드 데이터 테스트 (pgTAP). 로컬 db reset 뒤 seed.sql이 들어가 있어야 한다.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select is((select count(*) from resorts), 13::bigint, '스키장 13곳');
select is((select count(*) from shops where type = 'rental_shop' and status = 'approved'), 2::bigint, '승인된 렌탈샵 2곳');
select is((select count(*) from shops where type = 'lesson_team' and status = 'approved'), 1::bigint, '승인된 강습팀 1곳');
select ok((select count(*) from shop_members where is_owner) >= 3, '샵마다 owner가 있다');
select is((select count(*) from instructors), 4::bigint, '샘플 강사 4명');
select is((select count(*) from shop_instructors), 1::bigint, '전속 강사 1명');
select ok(exists(select 1 from instructor_certs where status = 'pending'), '검증 대기 자격증이 있다');
select ok(exists(select 1 from jobs where status = 'open' and assign_mode = 'bid'), '공개 입찰 공고가 있다');
select ok(exists(select 1 from auth.identities i join auth.users u on u.id = i.user_id
                 where u.email = 'shop1@winter.test' and i.provider = 'email'), '샵 관리자는 이메일로 로그인할 수 있다');

-- 시드도 RLS 규칙을 지킨다: 전속 강사는 입찰 공고를 못 본다
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims',
  json_build_object('sub', 'a0000000-0000-0000-0000-000000000024', 'role', 'authenticated')::text, true);
select is((select count(*) from jobs where status = 'open' and assign_mode = 'bid'), 0::bigint, '전속 강사에게 시드 입찰 공고가 보이지 않는다');

select * from finish();
rollback;
