# 원격 적용 대기 마이그레이션

main에 들어왔지만 운영 DB(winter-partner)에 아직 적용하지 않은 마이그레이션 목록. 원격 적용은 **사장님 승인 뒤에만** 한다(CLAUDE.md).

- 마이그레이션이 든 풀 리퀘스트는 여기에 파일 이름을 한 줄 추가해야 CI(migration-pr)가 통과한다.
- 승인 요청 때: `node scripts/ops/migration-preflight.mjs` 결과 + 영향 행 수(읽기 조회)를 함께 보고한다.
- 적용 뒤: 이 목록에서 지우고 "적용 기록"에 날짜를 남긴다.
- **새 화면 코드가 새 표·열을 읽는 경우 병합 = 배포라서, 병합 전에 원격 적용을 먼저 하거나 화면이 없는 열에도 버티게 만든다.** 순서는 풀 리퀘스트 본문에 적는다.

## 대기 중

| 마이그레이션 | 작업 | 데이터 변경 | 적용 순서 |
|---|---|---|---|
| `20261106032439_table_write_revoke.sql` | P21-12 public 모든 표에서 anon·PUBLIC 쓰기(INSERT·UPDATE·DELETE)와 anon·authenticated·PUBLIC의 TRUNCATE·REFERENCES·TRIGGER 회수 (SELECT 그대로) | 없음 (권한 회수만) | 사장님 승인 뒤. 새 표·열을 읽는 화면 없음 — 병합 전후 어느 쪽도 가능하나 승인 전에는 병합하지 않는다. 분석·확인 방법: docs/security/p21-12-analysis.md |

## 적용 기록

| 날짜 | 마이그레이션 | 승인 |
|---|---|---|
| 2026-11-03 | 20261102150000_settlement_integrity, 20261102151000_access_hardening | 사장님 승인 (P18) |
| 2026-11-05 | `20261103090000_pay_types.sql`, `20261103100000_settlement_guard.sql` | 사장님 승인 (P19). 사전 백업 backups/20261105-1128, 영향: 개인 정산 2행에 pay_type=business_3_3, 제약 위반 0. 적용 뒤 PR #4 병합 |
| 2026-11-05 | `20261105041909_storage_cert_guard.sql` | 사장님 승인 (P21, P21-4). 사전 백업: 사장님이 적용 직전에 직접. 영향: 데이터 변경 0, 제약·한도 위반 0. 원격 적용 뒤 병합 |
| 2026-11-05 | `20261105043347_fn_search_path.sql` | 사장님 승인 (P21, P21-5). 사전 백업: 사장님이 적용 직전에 직접. 영향: 데이터 변경 0, 제약·한도 위반 0. 원격 적용 뒤 병합 |
| 2026-11-05 | `20261105044233_input_ranges.sql` | 사장님 승인 (P21, P21-6). 사전 백업: 사장님이 적용 직전에 직접. 영향: 데이터 변경 0, 제약·한도 위반 0. 원격 적용 뒤 병합 |
| 2026-11-05 | `20261105052447_audit_events.sql` | 사장님 승인 (P21, P21-10). 사전 백업: 사장님이 적용 직전에 직접. 영향: 데이터 변경 0, 제약·한도 위반 0. 원격 적용 뒤 병합 |
| 2026-11-05 | `20261105050316_write_limits.sql` | 사장님 승인 (P21, P21-8). 사전 백업: 사장님이 적용 직전에 직접. 영향: 데이터 변경 0, 제약·한도 위반 0. 원격 적용 뒤 병합 |
| 2026-11-05 | `20261105114656_consult_schema.sql` | 사장님 승인 (P22-1). 백업 생략(사장님 지시: 실사용자 0명, 삽입은 테스트 샵의 꺼진 기본값). 적용 직전 실사용자 0·샵 2·문의 0 재확인. 영향: 안내 템플릿 16행(모두 비활성)·상담 설정 2행(자동응답 꺼짐)·app_settings 키 3개. 적용 뒤 기존 AI 게이트(intake·bid_assist·customer_summary)·consult 정상, anon 차단 확인. 적용 뒤 PR #18 병합 |
| 2026-11-06 | `20261105133519_consult_instagram.sql`, `20261105141851_consult_inbox.sql`, `20261105145008_consult_retention.sql`, `20261105151914_consult_admin_metrics.sql` | 사장님 승인 (P22-4~7). 06:27 KST 적용(`db push --linked --yes`, dry-run에서 정확히 4개 확인). 백업 생략(사장님 지시: 실사용자 0명, 4개 모두 함수·색인·열 추가·권한 변경뿐, 최상위 데이터 변경 문장 없음). 적용 직전 실사용자 0·샵 2(모두 테스트)·conversations/messages/inquiries/ai_feedback/shop_channels 0행, 새 열·RPC 없음, 인스타 채널 행 0(고유 색인 위반 0) 재확인. 적용 뒤 원격 목록 65개 짝 맞음, `conversations.reply_to_enc`·새 RPC 7개 확인, 두 샵의 AI 게이트(note_tidy·intake·bid_assist·consult) ok. 적용 뒤 #24(P22-3) 다음으로 #36·#37·#38·#39 병합 |
| 2026-11-06 | `20261105214254_instructor_assignments_comment.sql`, `20261105230951_view_write_revoke.sql` | 사장님 승인 (P21-11 긴급 P1). 08:28 KST 적용(`db push --linked --yes`, dry-run에서 정확히 2개). 백업 생략(사장님 지시: 실사용자 0명, 권한 회수와 설명 주석뿐). 영향: 데이터 변경 0, 권한만 회수. 적용 전 운영 덤프: `instructor_assignments` authenticated ALL, `customer_consent_state` anon·authenticated ALL → 적용 뒤 SELECT·MAINTAIN만, 두 뷰 정의 그대로, 원격 목록 67개 짝 맞음. 테스트 강사의 뷰 DELETE·UPDATE → 42501(없는 id 조건이라 데이터 변경 없음), check:prod 17/17·스모크 21/21. 적용 뒤 PR #41 병합 |
| 2026-11-06 | `20261106015911_consult_license.sql` | 사장님 조건부 사전 승인(P23-2, 2026-11-06 12:09 지시). 12:18 KST 적용(`db push --linked --yes`, dry-run 정확히 1개). 백업 생략(사장님 지시: 실사용자 0명, 새 표·함수 추가뿐). 적용 직전 조건 확인: #45 CI 전부 통과(main 반영 뒤), 실사용자 0, 새 표 없음, `consult_license_required` 키 없음, 자동 이행 대상 0곳, SQL 재독(기존 표 행 변경 없음·새 객체 anon 권한 없음·스위치 false면 기존 함수 4개 동작 동일). 영향: `consult_plans` 1행(standard_v1 임시안), `app_settings` 키 1개(false), 사용권 0행, 기존 데이터 변경 0. 적용 뒤: 원격 68개 짝 맞음, 새 표 RLS·정책 2개씩, authenticated select만(`admin_note` 제외), anon 42501, 기존 AI 게이트·consult ok, check:prod 17/17·스모크 21/21. 적용 뒤 PR #45 병합 |
