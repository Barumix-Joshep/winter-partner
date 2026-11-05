-- P21-5 instructor_assignments 뷰(의도된 SECURITY DEFINER, docs/security/checklist.md 7번 "허용된 예외") 회귀 테스트
-- 뷰가 소유자 권한으로 돌기 때문에 열·where가 바뀌면 바로 금액·남의 배정이 새어 나간다. 그 둘레를 고정한다.
-- (팀 강습 한 건의 금액 비움·남의 강습 한 건 0행은 access_hardening.test.sql에 있다. 여기서는 열 목록·anon·전체 행 기준)
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- 박스키(팀원)가 팀(평창 라이딩스쿨)으로 맡은 강습 2건, 이보드가 직접 맡은 강습 1건
insert into shop_instructors (shop_id, instructor_id) values ('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000023');
insert into jobs (id, shop_id, resort_id, starts_at, ends_at, lesson_type, student_count, instructor_rate, status, assign_mode) values
  ('e0000000-0000-0000-0000-000000021501', 'b0000000-0000-0000-0000-000000000002', (select id from resorts where name = '용평'),
   '2027-01-20 10:00+09', '2027-01-20 12:00+09', 'group', 3, 200000, 'assigned', 'bid'),
  ('e0000000-0000-0000-0000-000000021502', 'b0000000-0000-0000-0000-000000000002', (select id from resorts where name = '용평'),
   '2027-01-21 10:00+09', '2027-01-21 12:00+09', 'group', 3, 200000, 'assigned', 'bid'),
  ('e0000000-0000-0000-0000-000000021503', 'b0000000-0000-0000-0000-000000000002', (select id from resorts where name = '용평'),
   '2027-01-22 10:00+09', '2027-01-22 12:00+09', 'private', 1, 90000, 'assigned', 'bid');
select set_config('app.system_write', 'on', true);
insert into assignments (job_id, instructor_id, via_shop_id, final_rate) values
  ('e0000000-0000-0000-0000-000000021501', 'c0000000-0000-0000-0000-000000000023', 'b0000000-0000-0000-0000-000000000003', 185000),
  ('e0000000-0000-0000-0000-000000021502', 'c0000000-0000-0000-0000-000000000023', 'b0000000-0000-0000-0000-000000000003', 190000),
  ('e0000000-0000-0000-0000-000000021503', 'c0000000-0000-0000-0000-000000000022', null, 90000);
select set_config('app.system_write', 'off', true);

-- (a) 열 목록이 정확히 이것(순서 포함). 열을 더하면 실패 → checklist 7번과 이 테스트를 같이 고친다
select is(
  (select array_agg(attname::text order by attnum) from pg_attribute
    where attrelid = 'public.instructor_assignments'::regclass and attnum > 0 and not attisdropped),
  array['id', 'job_id', 'instructor_id', 'via_shop_id', 'final_rate', 'completed_at', 'lesson_note', 'approved_at'],
  '뷰 열은 id·job_id·instructor_id·via_shop_id·final_rate·completed_at·lesson_note·approved_at 뿐');

-- (b) anon은 읽을 권한 자체가 없다
set local role anon;
select throws_ok($$select count(*) from public.instructor_assignments$$, '42501', null, 'anon은 뷰를 못 읽는다');
reset role;

-- (c) 팀 강습 행은 모두 금액이 비어 있다 (빈 결과로 통과하지 않게 팀 행 수도 확인)
select pg_temp.login('a0000000-0000-0000-0000-000000000023'); -- 박스키(팀원)
select is((select count(*) from instructor_assignments where via_shop_id is not null), 2::bigint, '팀원은 자기 팀 강습 2건을 본다');
select is((select count(*) from instructor_assignments where via_shop_id is not null and final_rate is not null), 0::bigint,
  '팀 강습 행은 모두 final_rate가 null');

-- (d) 다른 강사의 배정은 0행 (표에는 다른 강사 배정이 있다)
reset role;
select ok((select count(*) from assignments where instructor_id <> 'c0000000-0000-0000-0000-000000000022') >= 3, '표에는 다른 강사 배정이 있다');
select pg_temp.login('a0000000-0000-0000-0000-000000000022'); -- 이보드
select is((select count(*) from instructor_assignments where instructor_id <> 'c0000000-0000-0000-0000-000000000022'), 0::bigint,
  '뷰에는 다른 강사 배정이 하나도 없다');
reset role;

select * from finish();
rollback;
