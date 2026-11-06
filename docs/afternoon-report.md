# 오후 자율 작업 기록 (2026-11-06)

사장님 지시(12:09)로 [1]~[8]을 순서대로 진행했다. 시각은 한국 시간. 병합마다 배포가 끝난 뒤 `npm run check:prod`와 운영 스모크(21화면, AI 0회)를 돌렸고 **모두 통과**(17/17, 21/21)했다.

## 항목별 결과
| # | 항목 | 결과 | PR · 커밋 |
|---|---|---|---|
| 1 | task/P23-1b(열린 질문 결정 기록) 병합 | **완료** 12:10 | #44 · `baab8b3` |
| 2 | P23-2 원격 적용(조건부 사전 승인) → 병합 | **완료** 적용 12:18, 병합 12:35 | #45 · `b0a7788` |
| 3 | P23-3 본사 사용권 관리 화면 | **완료** 13:04 (일부 기능은 스키마가 필요해 뺌, 아래) | #48 · `f045ee0` |
| 4 | P23-5 준비 — 시범 샵 체험 사용권 런북 | **완료** 13:15 (실행 안 함) | #49 · `d0637e7` |
| 5 | P21-12 준비 — 분석·회수 마이그레이션·일반 테스트 | **멈춤(지시대로)** PR CI 통과, 적용·병합은 승인 대기 | #47 (미병합) |
| 6 | P21-13 중 마이그레이션 없는 부분 — 함수 일반 테스트 | **완료** 12:32 (기존 함수 실패 0) | #46 · `9a63716` |
| 7 | 11/7 아침 점검 준비 | **완료** (이 PR: `docs/ops-check.md` ⑥ + 아래 목록) | 이 PR |
| 8 | 최종 보고 | 이 문서 | 이 PR |

## [2] P23-2 원격 적용 — 조건 확인과 검증
**적용 전 조건 (모두 참)**
- a. #45를 main에 맞춘 뒤(update-branch, 강제 푸시 없음) CI security·unit·db·e2e-core 등 전부 통과.
- b. `migration-preflight` 대기 1개, `db push --linked --dry-run`에 정확히 `20261106015911_consult_license.sql`만.
- c. 운영 읽기: 실사용자 0명(전체 7명 모두 테스트), `consult_plans`·`consult_licenses`·`consult_usage_packs` 없음(REST 스키마 목록), `private.app_settings`에 `consult_license_required` 키 없음(private 스키마 읽기 전용 데이터 덤프에서 키 이름만 셈, 값은 출력하지 않음).
- d. SQL 다시 읽기: 최상위 문장은 새 표·함수·권한·정책 만들기 + insert 두 줄(요금제 1행, 설정 키 1개) + 자동 이행 함수 호출뿐. **자동 이행 대상(자동응답 켬·켜진 채널) 적용 직전 0곳** → 사용권 0행. 기존 표 행을 바꾸는 문장 없음. 새 표는 anon·authenticated 쓰기 6종 명시적 회수, 새 함수는 public·anon 실행 회수. 다시 정의한 기존 함수 4개(`ai_gate`·`set_consult_settings`·`consult_connect_instagram`·`private.consult_quota_ok`)를 앞 정의와 비교: 추가된 확인은 모두 스위치 false면 건너뛰고, `daily_cap`은 사용권이 없으면 기존 설정값 → 동작 동일.

**적용** 12:18:21~24 `npx supabase db push --linked --yes`, 백업 생략(지시: 실사용자 0명, 새 표·함수 추가뿐).

**적용 뒤 검증 (읽기만)**
| 확인 | 결과 |
|---|---|
| 원격 마이그레이션 목록 | 68개, 로컬과 짝 맞음 |
| 새 표 | 3개 모두 RLS 켜짐, 정책 2개씩(멤버 읽기·본사 읽기) |
| 표 권한 | authenticated: SELECT만(`consult_licenses`는 `admin_note` 뺀 열 단위). anon: 없음 — 운영에서 anon select·insert 모두 42501 |
| 함수 권한 | 본사 RPC 7개·`consult_admin_license_overview`·`consult_my_usage`: authenticated+service_role. `consult_license_check`·`consult_license_sweep`: service_role만 |
| 트리거 | `consult_trial_start` 있음 |
| 데이터 | `consult_plans` 1행 `standard_v1`(59,000원·2,000건·block·1,000건 19,000원·체험 10일·대기 14일·알림 3일, 활성), 사용권 0, 팩 0, 스위치 `false` |
| 기존 AI 게이트 | 두 샵 모두 note_tidy·intake·bid_assist·consult `ok`, `consult_license_check` `ok` |
| 운영 | check:prod 17/17, 스모크 21/21(AI 0회), 카카오 웹훅 잘못된 토큰 → 기본 안내(200) |
| 가짜 웹훅 리허설 | 운영에는 실제 채널이 없어 못 함 → 로컬 E2E `ai-consult-license.spec.ts`(CI 통과)로 갈음 |

그 뒤 #45에 적용 기록(`docs/pending-migrations.md` 적용 기록, `tasks.json` P23-2 done)을 커밋해 CI 통과 후 병합.

## [3] P23-3 — 뺀 것(스키마가 필요해서)
화면에 필요한 RPC는 P23-2에 모두 있었다. 아래는 마이그레이션이 있어야 하는 덤 기능이라 만들지 않았다.
1. 사용권 취소·삭제(잘못 부여 되돌리기) — RPC 없음, 표 삭제 권한 회수됨. 지금은 중지만.
2. 이미 부여한 사용권의 요금제 바꾸기 — `plan_id` 바꾸는 RPC 없음.
3. 본사 메모만 고치기 — 부여·유료 전환·연장·중지 때만 함께 저장.
4. 새 요금제 없이 요금제만 끄기 — `create_plan`의 옛 요금제 끄기로만.
5. 부가세 포함 요금제 — `create_plan`이 `vat_included = false` 고정.

## [5] P21-12 — 승인 대기 (PR #47)
- 분석(`docs/security/p21-12-analysis.md`): **anon이 표에 직접 써야 하는 경로 없음**(셀프 등록·보호자 동의·웹훅·크론은 모두 서버 service_role RPC, 가입은 Auth). **authenticated가 TRUNCATE·REFERENCES·TRIGGER를 쓸 이유 없음.** 로컬에서 로그인 사용자 역할로 `truncate public.notifications`가 성공하는 것을 확인(되돌린 트랜잭션).
- 마이그레이션 `20261106032439_table_write_revoke.sql`: public 모든 표에서 anon·PUBLIC 쓰기 6종 회수, authenticated는 TRUNCATE·REFERENCES·TRIGGER만 회수. SELECT와 authenticated INSERT·UPDATE·DELETE 유지. 데이터 변경 없음.
- 일반 테스트 `table_grants.test.sql`(9개, 허용 목록 비어 있음): 적용 전 실패·적용 후 통과 확인. CI는 #45 반영 뒤 다시 돌려 통과(consult 표 포함).
- `docs/pending-migrations.md` "대기 중" 등록. **적용·병합은 하지 않았다.**

## [6] P21-13 일부 — 함수 일반 테스트 (PR #46)
`function_grants.test.sql`: public 함수 84개(확장 함수 제외) 모두 anon·PUBLIC 실행 0, 허용 목록 비어 있음, 기존 실패 0. #46이 #45보다 먼저 병합돼 두 변경이 함께 CI를 돈 적이 없어서, 병합된 main을 로컬에서 직접 돌림: **pgTAP 66개 파일 832개 통과**. private 함수 PUBLIC 회수·시퀀스 회수는 손대지 않음(마이그레이션 필요).

## 오늘 적용된 운영 변경 (2026-11-06 하루)
| 시각 | 마이그레이션 | 승인 |
|---|---|---|
| 06:27 | P22-4~7 상담 4개(`133519`·`141851`·`145008`·`151914`) | 사장님 승인 |
| 08:28 | `20261105214254_instructor_assignments_comment`, `20261105230951_view_write_revoke` (P21-11) | 사장님 승인 |
| 12:18 | `20261106015911_consult_license` (P23-2) | 사장님 조건부 사전 승인 |

오늘 병합한 PR: #31 #21 #24 #36 #37 #38 #39 #40 #35 #41 #42 #43 #44 #46 #45 #48 #49 + 이 보고서 PR. 원격 대기 마이그레이션: P21-12(`20261106032439`) 1개(승인 대기).

## 11/7 아침에 열어 볼 쿼리 (Supabase SQL Editor, 모두 읽기)
11/7 03:00 KST 정리 작업은 **90일 상담 정리(P22-6)와 사용권 정리(P23-2)가 처음 함께 도는 실행**이다. 자세한 기준은 `docs/ops-check.md` "매일 정리 작업 점검".
1. **①** 실행 기록 — 11/7 03:00 무렵 `ok = true`, 건수 모두 0
2. **⑥** 사용권 정리 결과 — `consult_licenses_sweep`이 `{"required": false, "trial_started": 0, ...}`
3. **⑥** 사용권 표 — `plans` 1, `standard_v1_active` 1, `licenses` 0, `license_required` `false`
4. **③** 강습 등록 문의 연락처 — 0
5. **⑤** 서버 오류 — 0건(+ Vercel 로그에 `daily maintenance failed` 없음)

## 새로 발견한 문제와 위험도
| 문제 | 위험도 | 내용 · 제안 |
|---|---|---|
| main 푸시 때 db·unit CI가 돌지 않음 | P3 | PR끼리 병합 순서가 엇갈리면(#46 → #45) 합친 상태는 CI가 안 본다. 오늘은 로컬에서 직접 확인. 제안: 브랜치 보호에서 "병합 전 최신 main 필요(Require branches to be up to date)" 켜기(사장님 설정) 또는 main 푸시에도 db 작업 |
| CI db 단계 러너 Docker 오류 | P3 | 오늘 2회(#37 네트워크, #48 `toomanyrequests`·포트 사용 중). 재실행으로 통과. 반복되면 Docker 이미지 캐시 검토 |
| 사용권 체험 시계는 스위치가 꺼져 있어도 돈다 | P3(운영 주의) | 스위치를 늦게 켜면 이미 끝난 체험이 켜는 순간 막힌다. 런북 3번에 "켜기 전 확인·연장" 명시. 지금 사용권 0건 |
| 매일 정리 작업이 사용권 정리 실패도 전체 실패(500)로 기록 | P3 | 네 정리는 동시에 돌아 다른 정리는 그대로 실행되지만, 기록은 실패로 남는다. ops-check ①에서 `error` 문장으로 구분 |
| P23-3 사용권 취소 기능 없음 | P3 | 잘못 부여하면 중지만 가능. 필요하면 다음 마이그레이션에 취소 RPC |
| 로컬에 4일 전 멈춘 `supabase migration new` 프로세스 2개 | 정보 | 로컬 개발 기계만, 운영 무관. 필요하면 종료 |

## 사장님이 돌아와서 할 일 (우선순위순)
1. **11/7 아침 점검** — 위 쿼리 1~5(약 5분). 이상하면 결과만 Claude Code에 전달.
2. **P21-12 적용·병합 승인(PR #47, P2)** — 실데이터 전에 권장. 승인하면 적용 전 확인(덤프 GRANT 줄·영향 표 수) → 적용 → 검증 → 병합.
3. **시범 차단 항목** — 메일(Resend)·도메인, 법률 검토 의뢰 발송, 테스트 데이터 삭제 승인(`docs/pilot-onboarding.md` 운영용 체크리스트).
4. **Vercel `CONSULT_ENCRYPTION_KEY`·`CONSULT_HASH_KEY`** — AI 상담 시범 전.
5. **P23-5 실행 시점 결정** — 타타타렌탈샵 가입·카카오 채널 연결(P22-8) 뒤 `docs/ai-consult/pilot-license-runbook.md` 순서대로. 스위치는 사장님만 켠다.
6. (선택) 브랜치 보호 "최신 main 필요" 켜기, P23-3에서 뺀 사용권 취소 기능이 필요한지 결정.
