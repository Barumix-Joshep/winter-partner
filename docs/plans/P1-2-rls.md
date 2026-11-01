# P1-2 RLS 정책

## 목표
CLAUDE.md 도메인 규칙을 DB 수준에서 강제한다. 앱 코드가 실수해도 다른 샵 데이터가 새지 않아야 한다.

## 설계
- 모든 public 테이블에 RLS를 켠다. 정책은 `authenticated`(일부 기준 정보는 `anon`)에만 준다. service_role은 RLS를 우회한다(서버 작업용).
- 판단용 함수는 `private` 스키마(PostgREST 비노출)에 `security definer`로 둔다. 정책끼리 서로의 테이블을 조회하며 생기는 재귀를 막기 위해서다.
  - `is_platform_admin()`, `is_shop_member(shop)`, `is_shop_owner(shop)`, `is_any_shop_member()`, `is_lesson_team_member()`
  - `my_instructor_id()`, `is_exclusive()`, `job_shop_id(job)`, `job_open_for_bids(job, team)`, `has_job_link(job)`
- 열 단위 보호는 트리거로 한다(플랫폼 관리자도 authenticated로 접속하므로 열 GRANT로는 역할을 구분할 수 없다).
  - profiles.role, shops.status, instructors.cert_status·penalty_points, instructor_certs.status·verified_at → 플랫폼 관리자만
  - assignments: 샵 멤버가 아니면(=강사) completed_at·lesson_note만 바꿀 수 있다
- `jobs.customer_price`는 강사에게 보이면 안 되는데 RLS는 행 단위라, `job_prices` 테이블로 분리한다(샵 멤버만).
- `shops.created_by`(기본값 auth.uid())를 추가하고, 샵 생성 시 생성자를 owner로 shop_members에 넣는 트리거를 둔다.

## 규칙 → 정책
| 규칙 | 정책 |
|---|---|
| 샵 데이터 shop_id 격리 | jobs·customers·inquiries·job_customers·job_prices·settlements 등은 `is_shop_member` |
| 손님 연락처는 샵 관리자만 | customers·inquiries·customer_links·job_customers: 샵 멤버만(플랫폼 관리자도 제외). 강사용 레벨·메모 조회는 P4에서 함수로 제공 |
| 전속 강사는 입찰 공고를 못 본다 | jobs 조회: 공개 입찰 공고는 `my_instructor_id() is not null and not is_exclusive()`일 때만 |
| 입찰은 프리랜서(2단계: 팀)만 | bids insert: 전속 아닌 강사 본인, 또는 allow_team_bids 공고에 lesson_team 멤버(자기 샵 공고 제외) |
| 선정·금액 조정은 관리자 | bids 상태 변경·assignments 생성/수정은 공고 샵 멤버. 강사는 offer 수락/거절만 |
| 자격증은 검증 후 공개 | instructor_certs 조회: 본인·플랫폼 관리자, 그 외에는 status='approved'만 |

## 범위 밖
- 일정 충돌 검사(P5-1), 전속 강사의 프리랜서 등록 차단(P3-4), 취소·패널티 처리(P5-4)
- 강사용 손님 레벨 조회 함수(P4)

## 검증
`supabase/tests/rls.test.sql`(pgTAP)을 로컬 DB에서 `npx supabase test db`로 돌린다. 이후 lint·tsc를 확인하고 `db push --linked`로 원격에 적용한다.
