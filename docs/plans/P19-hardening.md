# P19-2·P19-3·P19-4 계획 (시범 샵 전 보완)

P18 보고서(`docs/simulation-report.md`)의 P2 목록 중 돈과 이어지는 것(5·7·8·9)과 시범 전 권장(1·2·3·4·10·13), 테스트 안정화.

## P19-2 정산 무결성 후속 — 마이그레이션 `20261103100000_settlement_guard.sql`
- **샵 직접 쓰기 화면 정리**: 앱은 강습·배정을 표로 직접 쓰지 않는다(모두 RPC: create_job·send_job_offer·publish_bid_job·select_bid·approve_lesson·cancel…). 표 직접 쓰기는 샵 설정의 `shops`(이름·사업자번호·대표자)와 손님·연락 기록뿐. 그래서 RPC 전용으로 바꾸는 대신 **승인 이후 열 변경을 거부하는 트리거**로 막는다(정당한 흐름은 승인 전이거나 security definer RPC라 영향 없음).
  - jobs: status = approved 이면 starts_at·ends_at·status·shop_id 변경과 삭제 거부.
  - assignments: approved_at 이 있으면 job_id·instructor_id·via_shop_id·final_rate·approved_at 변경과 삭제 거부, 승인된 강습에 새 배정 거부.
  - 통과: 서비스 키(auth.uid() 없음), 본사, `app.system_write`.
  - 정식 절차: `correct_approved_lesson(job, starts, ends, final_rate, reason)` — 그 샵만, 사유 필수, 발행된 정산서에 든 강습은 거부(다음 달에 조정), 시간 겹침 확인, `lesson_corrections`에 이전·새 값·사유·사람, 그 강습이 든 draft 정산은 지워 다시 집계. 화면: 강습 상세 "승인된 강습 정정".
- **금액**: `private.check_won` 1원~1,000만 원(손님 강습료 0원부터) 안내 메시지를 create_job·select_bid·정정에서. 표에는 CHECK 제약 4개. 폼(`parseJob`, 선정)도 같은 범위로 먼저 막아 int 범위를 넘는 값이 DB까지 가지 않는다.
- **입찰·선정 겹침**: 잠금 순서를 공고 → 입찰로 통일. place_bid가 공고를 `for share`로 잠가 선정이 끝나면 "입찰 중 아님"으로 거부, 선정이 뒤면 열린 입찰을 함께 거절. select_bid는 전속이 된 강사 입찰을 거부. 동시성 E2E 6회 반복.
- **샵 유형·사업자번호**: 승인된 샵은 직접 못 바꾼다(처음 적는 사업자번호는 허용). `request_shop_change` → 본사 `/admin` "샵 정보 변경 요청" → `decide_shop_change`. 설정 화면은 바뀐 사업자번호를 요청으로 돌리고 "본사 확인 중"을 보여 준다.

## P19-3 사용자 경험과 보안
- 오류 화면: 루트·역할별(`/shop`·`/instructor`·`/admin`) `error.tsx`, 루트 `global-error.tsx`, `not-found.tsx`. 문구 "잠시 후 다시 시도해 주세요", 홈 버튼, 오류 번호 = Next `digest`(서버 오류는 `instrumentation.ts`가 ops_events.detail에 digest를 남기므로 본사가 `/admin/ops`에서 찾을 수 있다). 개인정보 없음.
- 보안 헤더(`next.config.ts` headers): HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy(카메라·위치 끔, 마이크는 음성 입력 때문에 self), X-Frame-Options DENY + frame-ancestors 'none'. CSP는 먼저 `Content-Security-Policy-Report-Only`로 켜고 E2E·스모크에서 위반을 모은 뒤 강제로 바꾼다(운영 반영은 배포 승인 때).
- 강습 시간: 지난 시간 등록 막기(서버 `parseJob`에 현재 시각, 폼 안내), 끝 시간이 시작보다 이르면 다음 날로(자정 넘김). 일정 충돌·정산 월은 시작 시각 기준(화면 안내). 표시도 "(다음 날)".
- 목록: 강습 200건씩 쪽 나누기, 손님 200명 넘으면 "더 있음"과 다음 쪽.
- 웹푸시 실패 로그: 상태 코드와 종류만.
- 390px 3곳.

## P19-4 테스트 안정화
- 원인: `next dev`는 경로를 처음 열 때 컴파일한다. 전체 실행 뒤쪽의 리허설 4단계가 PDF·Excel 경로를 처음 열며 컴파일 시간이 붙었다.
- 해결: `e2e/warmup.ts` — global-setup(웹 서버는 이미 떠 있음)에서 `src/app`의 모든 화면·경로를 역할별 계정으로 한 번씩 열어 컴파일을 테스트 전에 끝낸다. 리허설 4단계 제한 시간은 원래 값으로 돌린다. 완료 기준: 전체 E2E 3회 연속 통과.
