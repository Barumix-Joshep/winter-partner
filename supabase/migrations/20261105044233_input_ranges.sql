-- 보안 8(입력 검증): 화면은 검사하지만 DB 제약이 없어 API로 바로 쓰면 범위를 벗어나던 값에 CHECK 제약을 건다.
--   instructors.base_rate(강사가 직접 수정 가능) · exclusive_invites.exclusive_rate(샵이 제안) · shop_instructors.exclusive_rate
--   → null 또는 1원~1,000만 원 (P19 기준, 20261103100000_settlement_guard.sql과 같음)
--   jobs.student_count(샵이 직접 수정 가능) → 1:1=1명, 1:2=2명, 그룹=3~10명 (src/lib/shop/job.ts LESSON_TYPES와 같음)
-- 적용 전 운영 위반 행 0건 확인(2026-11-05 읽기 조회: 강사 단가·제안 단가·전속 단가·인원 모두 0). 데이터 변경 없음.
--
-- 되돌리기: alter table instructors drop constraint instructors_base_rate_range;
--   alter table exclusive_invites drop constraint exclusive_invites_rate_range;
--   alter table shop_instructors drop constraint shop_instructors_rate_range;
--   alter table jobs drop constraint jobs_student_count_by_type;

alter table public.instructors add constraint instructors_base_rate_range
  check (base_rate is null or base_rate between 1 and 10000000);
alter table public.exclusive_invites add constraint exclusive_invites_rate_range
  check (exclusive_rate is null or exclusive_rate between 1 and 10000000);
alter table public.shop_instructors add constraint shop_instructors_rate_range
  check (exclusive_rate is null or exclusive_rate between 1 and 10000000);
alter table public.jobs add constraint jobs_student_count_by_type
  check (case lesson_type when 'private' then student_count = 1
                          when 'semi' then student_count = 2
                          else student_count between 3 and 10 end);
