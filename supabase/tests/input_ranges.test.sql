-- 보안 8(입력 검증): 화면 검사를 거치지 않고 API로 바로 써도 금액·인원이 범위를 벗어나지 못한다 (pgTAP).
-- 금액은 P19 기준(1원~1,000만 원), 인원은 강습 형태(1:1=1, 1:2=2, 그룹=3~10명).
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

select pg_temp.as_user('a0000000-0000-0000-0000-000000000021');
select throws_ok($$update instructors set base_rate = -1 where user_id = 'a0000000-0000-0000-0000-000000000021'$$, '23514', null, '강사 기본 강습료는 음수가 안 된다');
select throws_ok($$update instructors set base_rate = 2000000000 where user_id = 'a0000000-0000-0000-0000-000000000021'$$, '23514', null, '강사 기본 강습료는 1,000만 원을 넘지 못한다');
select lives_ok($$update instructors set base_rate = 80000 where user_id = 'a0000000-0000-0000-0000-000000000021'$$, '정상 강습료는 저장된다');
reset role;

select pg_temp.as_user('a0000000-0000-0000-0000-000000000012');
select throws_ok($$insert into exclusive_invites (shop_id, instructor_id, exclusive_rate) values ('b0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000023', -1)$$, '23514', null, '전속 제안 단가는 음수가 안 된다');
reset role;

select throws_ok($$update shop_instructors set exclusive_rate = 0$$, '23514', null, '전속 단가는 1원 이상');

select pg_temp.as_user('a0000000-0000-0000-0000-000000000011');
select throws_ok($$update jobs set student_count = -5 where shop_id = 'b0000000-0000-0000-0000-000000000001' and status = 'open'$$, '23514', null, '수강 인원은 음수가 안 된다');
select throws_ok($$update jobs set student_count = 11, lesson_type = 'group' where shop_id = 'b0000000-0000-0000-0000-000000000001' and status = 'open'$$, '23514', null, '그룹 강습은 10명까지');
select throws_ok($$update jobs set student_count = 3, lesson_type = 'private' where shop_id = 'b0000000-0000-0000-0000-000000000001' and status = 'open'$$, '23514', null, '1:1 강습은 1명');
reset role;

select * from finish();
rollback;
