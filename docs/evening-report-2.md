# 저녁 자율 작업 보고 (2차) — 2026-11-07

사장님 지시(2026-11-07, 저녁 2차) [1]~[5]의 결과입니다.
- 공통 규칙은 모두 지켰습니다.
  - 켜짐 스위치는 `false` 그대로이고, 시범 샵 사용권은 0건입니다.
  - 테스트 데이터는 삭제하지 않았습니다.
  - 비밀값·외부 서비스 설정은 바꾸지 않았고, 비밀번호·키는 채팅과 문서 어디에도 쓰지 않았습니다.
- 운영 DB 변경은 [1]의 마이그레이션 1개뿐입니다. 나머지 운영 접근은 모두 읽기였습니다.
  - 읽기 전용 덤프, 건수 조회, 테스트 계정 로그인 뒤 조회.
  - 쓰기 전 검사에서 막히는 RPC 호출(새 행 0건 확인).

## 한눈에

| # | 항목 | 결과 | PR · 커밋 |
|---|---|---|---|
| 1 | P21-13 나머지 원격 적용 | **완료.** 조건 a~d가 모두 참이어서 15:29 KST에 적용했습니다. 적용 뒤 확인을 모두 통과해 15:40에 병합했습니다 | #52 `538f79f` |
| 2 | 스모크에 본사 계정 추가 | **보류(계정 없음).** 스모크 코드는 준비해 병합했습니다. 운영에 본사 역할 계정이 0개이고, 새 계정 생성은 사장님 승인 사항이라 만들지 않았습니다 | #56 |
| 3 | P21-14 준비 | **멈춤(지시대로).** PR을 올렸고 CI 통과까지만 했습니다. 적용·병합은 사장님 승인을 기다립니다 | #54 (열림) |
| 4 | 11/7 아침 점검 결과 정리 | **완료.** 03:00 정리 작업은 정상 실행됐습니다. 다만 운영 기록이 300자에서 잘리는 문제를 찾아 코드·문서 수정 PR을 병합했습니다(운영 DB 변경 없음) | #55 |
| 5 | 보고 | 이 문서입니다 | 이 PR |

병합한 PR: #52(15:40), #55(15:52), #56(15:54), 그리고 이 보고서 PR. 병합할 때마다 배포 뒤 check:prod 17/17, 운영 스모크 21/21(AI 0회)이 나왔습니다.
원격 적용한 마이그레이션: `20261106055522_private_fn_revoke.sql` 1개(15:29:02~06 KST). 이제 원격 마이그레이션은 70개입니다.

---

## [1] P21-13 나머지 (#52) — 완료

### 적용 전 조건 (모두 참)
| 조건 | 결과 |
|---|---|
| (사전) 최신 main 반영·CI | #52는 최신 main(`8fd33c4`)을 포함했습니다. CI는 security·unit·db·e2e-core·migration-check·label·Vercel이 모두 통과했습니다 |
| a. preflight·dry-run | preflight 대기 파일 1개(새 표·바뀌는 표·함수·데이터 변경 모두 —). dry-run에는 `20261106055522_private_fn_revoke.sql` **1개만** 보였습니다 |
| b. 실사용자 | 전체 7명이 모두 `@winter-partner.test`이라 **실사용자 0명**입니다. 샵 2곳 모두 [테스트]입니다 |
| c. 운영 값 = PR 설명 | 적용 직전 운영 덤프를 다시 뽑아 대조했습니다(아래). **모두 같았습니다** |
| d. 마이그레이션 재독 | 데이터 행을 바꾸는 문장이 0개입니다. 대상은 `nspname = 'private'`뿐이라 public 함수 권한은 건드리지 않습니다. authenticated 재부여는 24개뿐이고, 그 밖에는 시퀀스 anon UPDATE 회수 1줄입니다 |

조건 c의 대조 결과입니다. 2026-11-07 15:27~29, 운영 private·public·storage 스키마 덤프입니다.
- private 함수 87개 중 PUBLIC 실행이 65개입니다. 이 65개는 마이그레이션 되돌리기 목록 65개와 **이름까지 같습니다.**
- 정책 121개가 부르는 private 함수는 20개이고, 모두 허용 목록 안에 있습니다.
- 검사 제약이 부르는 함수: `is_encrypted`·`is_hmac`.
- 뷰 2개가 부르는 함수: `is_minor`·`setting_int`·`my_instructor_id`.
- invoker 함수 본문이 부르는 함수: `check_won`·`season_of`·`is_shop_member`·`my_instructor_id`·`is_platform_admin`·`is_minor`.
  - 부르는 함수는 `create_job`·`revisit_candidates`·`save_instructor_profile`·`set_week_availability`·`review_cert`·`require_guardian`·`consult_metric_range_ok`입니다.
- 위를 합치면 필요한 함수는 **26개 = 재부여 24 + 원래 직접 부여된 `cert_file_locked`·`cert_folder_has_room` 2**입니다. 새로 생긴 함수나 정책은 없습니다.

### 적용
`npx supabase db push --linked --yes`로 15:29:02~06 KST에 적용했습니다. 백업은 지시대로 생략했습니다(실사용자 0명, 권한 변경뿐).

### 적용 뒤 확인 (읽기 전용)
| 확인 | 결과 |
|---|---|
| private 함수 PUBLIC 실행 | **0개**(87개 모두 회수) |
| anon 실행 | **0개** |
| service_role | **65개**(적용 전 PUBLIC으로 실행하던 65개와 같음) |
| authenticated | **26개** = 재부여 24 + 원래 있던 cert 2. 위 "필요 26개"와 같음 |
| 시퀀스 anon | 7개 모두 `SELECT,USAGE`만, **UPDATE 0** |
| 권한 외 스키마 차이 | public·storage는 시퀀스 GRANT 7줄만 바뀌었습니다. private는 GRANT·REVOKE 줄과 빈 줄만 바뀌었습니다 |
| check:prod | 17/17 |
| 운영 스모크 | 21/21, AI 0회. 적용 직후와 병합·배포 뒤 두 번 돌렸습니다 |

### 깨질 수 있는 경로 9가지 (PR 설명 순서)
테스트 계정(렌탈샵·강습팀·강사)으로 운영에 로그인해 확인했습니다. 쓰기 경로는 **쓰기 전 검사에서 막히는 입력**으로 private 함수가 실행되는지만 봤습니다. 확인 뒤 15:29 이후 jobs·customers 새 행이 0건이었습니다.

| # | 경로 | 확인한 것 | 결과 |
|---|---|---|---|
| 1 | 로그인 사용자의 RLS 조회·쓰기, Realtime 알림 | 렌탈샵 16개 표·뷰, 강습팀 6개, 강사 10개 조회. 모두 정상 건수가 나오고 권한 거부 0 | **통과** (Realtime 구독 코드는 앱에 없음) |
| 2 | 자격증 이미지(storage 정책) | 강사의 `certs` 버킷 내 폴더 목록 조회(정책이 `my_instructor_id` 호출) | **통과** (올리기는 쓰기라 확인하지 않음, CI pgTAP·E2E가 봄) |
| 3 | 손님 목록·동의 상태(security_invoker 뷰) | 렌탈샵이 `customer_consent_state` 조회(`is_minor`·`setting_int` 호출) | **통과** |
| 4 | 강습 등록·재방문 후보·가능 일정·프로필·자격증 검토(invoker RPC) | 아래 5개 호출 | **통과** |
| 5 | 문의·상담 대화·채널 쓰기(검사 제약) | 쓰기라 운영에서 시험하지 않았습니다. 덤프로 `is_encrypted`·`is_hmac`이 authenticated·service_role에 부여된 것을 봤습니다. 렌탈샵의 `conversations` 조회도 정상입니다 | **통과(덤프·CI)** |
| 6 | 트리거(겹침·승인 잠금·감사·입찰 한도·보호자 필수) | 쓰기라 운영에서 시험하지 않았습니다. 트리거는 발동 때 실행 권한을 검사하지 않고, invoker 트리거 `require_guardian`이 부르는 `is_minor`는 부여돼 있습니다(덤프) | **통과(덤프·CI)** |
| 7 | 가입 → 프로필 생성(auth 트리거) | 계정을 만들어야 해서 시험하지 않았습니다. `handle_new_user`는 security definer이고 service_role 실행이 그대로입니다(덤프). 스모크의 기존 계정 로그인 6개는 정상입니다 | **통과(덤프·CI)** |
| 8 | 서버(웹훅·크론·/join·/consent) | 서버 역할로 `consult_license_check`를 두 샵에 대해 불러 둘 다 ok. 적용 뒤 서버 오류 기록 0건. 다음 크론은 11/8 03:00 | **통과** (크론은 11/8 아침 ①로 확인) |
| 9 | 앞으로 만드는 private 함수 | `private_function_grants` 일반 테스트가 main CI에 들어갔습니다(#52) | **통과(CI)** |

4번 경로의 RPC 5개입니다.

| RPC | 넣은 입력 | 결과 |
|---|---|---|
| `revisit_candidates` | 읽기 전용(season_of) | 정상, 0행 |
| `create_job` | 지급액 −1 | 22023 "강사 지급액은 1원 이상…" — `check_won`이 실행돼 막음 |
| `set_week_availability` | 거꾸로 된 기간 | 22023 — `my_instructor_id` 통과 뒤 기간 검사가 막음 |
| `save_instructor_profile` | 빈 종목 | 22023 — `my_instructor_id` 통과 뒤 종목 검사가 막음 |
| `review_cert` | 본사가 아닌 계정 | 42501 "본사만…" — `is_platform_admin`이 실행돼 막음 |

`create_job`은 처음에 다른 샵 ID를 넣어 42501 "이 샵의 멤버만…"이 나왔습니다. 이것도 `is_shop_member`가 실행된다는 뜻입니다.

기록: `docs/pending-migrations.md` "적용 기록"에 "사장님 조건부 사전 승인(P21-13, 2026-11-07 지시)"로 남겼습니다. 대기 목록에서 지웠고, tasks.json P21-13은 done입니다.

---

## [2] 스모크에 본사 계정 — 보류 (계정 없음, 코드는 준비)

### 알게 된 것
- **운영에 본사(platform_admin) 역할 계정이 하나도 없습니다.** 2026-11-07 읽기 조회 결과 profiles는 강사 5·샵 관리자 2이고, 7명 모두 `@winter-partner.test`입니다.
  - 지금 운영 `/admin`에 들어갈 수 있는 계정이 없다는 뜻입니다. 사장님 본인 계정도 운영에는 없습니다.
- 테스트 계정 중 `test-admin@winter-partner.test`가 있지만 역할이 **강사**이고 강사 행에 연결돼 있습니다.
  - 이 계정은 리허설 때 "비교 화면 확인 때만 잠깐 관리자로" 쓰려고 만든 것입니다(`scripts/rehearsal/prod-setup.mjs`).
  - 본사 지정 함수 `private.grant_platform_admin`(P12-1)은 강사·샵에 연결된 계정을 거부하므로, 이 계정은 본사로 바꿀 수 없습니다.
- 따라서 스모크용 본사 계정은 **운영에 새로 만들어야 합니다.** 계정 생성은 사장님 승인 사항이라 만들지 않았습니다.

### 준비한 것 (#56, 병합)
- `scripts/rehearsal/prod-smoke.mjs`는 `.env.rehearsal.local`(git 제외)에 `SMOKE_ADMIN_EMAIL`·`SMOKE_ADMIN_PASSWORD`가 있을 때만 본사 화면을 확인합니다.
  - 확인하는 것: 본사 로그인 → `/admin` → `/admin/ai/consult`(사용권 관리)가 열리는지, 오류 화면·가로 넘침이 없는지.
  - 아무것도 누르지 않습니다.
  - 로그인 뒤 `/admin`으로 가지 않으면(본사 역할이 아니면) 실패로 남깁니다.
  - 이메일은 `@winter-partner.test`만 받습니다.
  - 값이 없으면 지금처럼 21화면만 보고 `adminSkipped: true`를 남깁니다.
- 운영에서 두 가지로 시험했습니다.
  - 값이 없을 때: 21/21, 건너뜀.
  - 본사가 아닌 `test-admin`을 본사 자리에 넣었을 때: 원래 21화면은 통과했고, 본사 자리는 "로그인 뒤 /admin가 아님"으로 실패했습니다. 역할 검사가 동작합니다.
- 계정을 만드는 방법을 `docs/ci.md` "운영 확인"에 적었습니다.

### 선택지
| 선택지 | 방법 | 장단점 |
|---|---|---|
| **A. 스모크 전용 테스트 본사 계정 (추천)** | ① 새 이메일(예: `test-hq@winter-partner.test`)로 운영 가입(강사·샵 등록은 하지 않음)<br>② Supabase SQL Editor에서 `select private.grant_platform_admin('<그 이메일>');`<br>③ 그 비밀번호를 `.env.rehearsal.local`의 `SMOKE_ADMIN_PASSWORD`에, 이메일을 `SMOKE_ADMIN_EMAIL`에 | 본사 권한 계정이 하나 더 생깁니다. 그래서 `REHEARSAL_PASSWORD`와 다른 긴 비밀번호를 쓰고, 그 파일은 사장님 Mac에만 둡니다. 시범 전 테스트 데이터를 지울 때 이 계정도 함께 지웁니다(`docs/test-data-cleanup.md`에 추가 필요) |
| B. 사장님 본인 본사 계정을 스모크에 사용 | 실제 본사 계정을 먼저 만들고(아래 할 일 2) 그 값을 넣음 | 계정 수는 늘지 않습니다. 대신 실제 운영자 비밀번호가 스모크 파일에 들어가 권하지 않습니다 |
| C. 본사 화면은 사람이 확인 | 큰 배포 뒤 사장님이 `/admin`·`/admin/ai/consult`를 직접 엽니다 | 계정 추가가 없습니다. 자동 확인은 빠집니다 |

**로그인 방법:** 계정이 생기면 평소처럼 `/login`에서 그 이메일과 비밀번호로 로그인합니다. 값 자체는 이 문서에 쓰지 않습니다.

---

## [3] P21-14 준비 (#54) — 멈춤 (사장님 승인 대기)

P21-12(표 쓰기)·P21-13(private 함수)과 같은 방식입니다.
- 산출물: 분석 문서 `docs/security/p21-14-analysis.md`, 일반 테스트 `supabase/tests/maintain_grants.test.sql`(8개), PR 설명에 깨질 수 있는 경로 9가지와 적용 전 확인 방법.
- 마이그레이션: `20261107064020_p21_14_maintain_revoke.sql`.

| 바꾸는 것 | 지금 (운영 덤프 = 로컬) | 바꾼 뒤 |
|---|---|---|
| public 표·뷰 MAINTAIN(VACUUM·ANALYZE·REINDEX·LOCK TABLE 등) | anon 49곳(표 48·뷰 1), authenticated 50곳(표 48·뷰 2) | anon·authenticated 0곳 (service_role 그대로) |
| private 스키마 USAGE | anon·authenticated·service_role | anon만 회수 |
| public 시퀀스 7개 | anon SELECT·USAGE, authenticated SELECT·UPDATE·USAGE | anon 없음, authenticated USAGE만 |

- authenticated의 시퀀스 USAGE는 남깁니다. resorts·sports가 serial 열이고 본사가 정책으로 직접 추가하기 때문입니다.
- 앱 코드에서 시퀀스 함수·LOCK TABLE·VACUUM을 쓰는 곳이 없음을 확인했습니다. Realtime 구독과 공개 버킷도 없습니다.
- 테스트 결과입니다.
  - 로컬 `db reset`(마이그레이션 71개) 뒤 pgTAP 69개 파일 **859개 통과**.
  - 마이그레이션을 빼면 새 테스트가 FAIL합니다(빨간 단계 확인).
  - CI: 전부 통과(security·unit·db·e2e-core·migration-check·label·Vercel). 병합하지 않았습니다.
- `docs/pending-migrations.md` 대기 목록에 "사장님 승인 대기 — 승인 전에는 병합도 하지 않는다"로 등록했고, tasks.json P21-14는 blocked(승인 대기)입니다.

---

## [4] 11/7 03:00 KST 정리 작업 — 정상 실행, 기록 잘림 1건 수정

### 실행 결과 (읽기 전용: `ops_events`, Vercel 로그, 운영 건수 조회)
| 점검 | 결과 | 판정 |
|---|---|---|
| ① 실행 기록 | 2026-11-07 **03:00:16** KST `ok = true`. 11/3부터 매일 03:00 정리, 09:00 알림 보내기가 빠짐없이 성공했습니다 | 정상 |
| ① 건수 | Vercel 로그의 전체 결과: 손님 익명화 0, 접속 기록 정리 0, 상담 정리(대화·메시지·피드백·문의 삭제·보존) 모두 0, 인스타 토큰 `skipped: true` | 정상 |
| ② 90일 지난 상담 | 대화 0, 메시지 0(운영 상담 표는 0행) | 정상 |
| ③ 연락처가 남은 보존 문의 | 0 | 정상 |
| ④ 24시간 익명화·2년 지난 접속 기록 | 0, 0 | 정상 |
| ⑤ 서버 오류 | `ops_events` 24시간 0건. Vercel 오류·경고 로그는 11/7 00:00~15:30 KST에 0건이고 `daily maintenance failed`도 없습니다 | 정상 |
| ⑥ 사용권 정리 | `required: false`, 체험 시작·중지·만료·한도 알림 모두 0. 플랜 1(standard_v1 사용 중), 사용권 0, 팩 0, 켜짐 스위치 `false` | 정상 |
| ⑦ 표 권한 | 표 52개, anon 쓰기 0, authenticated TRUNCATE·REFERENCES·TRIGGER 0, authenticated S49·I45·U43·D44, anon SELECT 48. 11/6 적용 직후와 같습니다 | 정상 |

### 이상 1건 — 운영 기록 잘림 (위험도 P3, #55로 수정)
- **증상:** 11/7 03:00 실행의 `ops_events.detail`이 300자에서 잘려 JSON이 깨졌습니다(`…"consultLicenses":{"required":false,"susp`에서 끝남).
  - 그래서 `docs/ops-check.md`의 ①·⑥ SQL(`detail::jsonb`)을 SQL 편집기에서 돌리면 **"invalid input syntax for type json" 오류**가 납니다.
  - 정리 작업 자체는 정상입니다. 전체 결과는 Vercel 로그에 그대로 남아 있습니다.
- **원인:** `record_ops_event`가 `left(p_detail, 300)`으로 자릅니다. P23-2에서 정리 결과에 `consultLicenses`가 더해져 결과 JSON이 356자가 됐습니다.
  - 11/6 기록은 짧아서 문제가 없었습니다.
  - 단위 테스트는 기록 함수를 가짜로 바꿔 쓰고 있어 길이를 보지 못했습니다.
- **위험:** 데이터·개인정보에는 영향이 없습니다. 아침 점검 SQL이 오류가 나서 점검을 못 하는 것과, 기록에서 인스타 결과가 빠지는 것이 영향의 전부입니다.
  - 정리가 실패하는 날에는 `실패: …` 문장이 남아 300자 안이라 보입니다.
  - 본사 운영 화면(`/admin/ops`)은 detail을 글자 그대로 보여 줄 뿐이라 깨지지 않습니다.
- **수정 (#55, 병합, 운영 DB 변경 없음)**
  - 코드: `cronDetail()`이 운영 기록을 언제나 300자 안의 올바른 JSON으로 만듭니다.
    - 안쪽에서 0인 항목은 뺍니다(없으면 0).
    - 그래도 길면 맨 위 값만 남기고 `cut: true`를 붙입니다.
    - 매일 정리와 알림 보내기 크론 둘 다 씁니다. 단위 테스트 6개를 더했습니다.
  - 문서: `docs/ops-check.md` ①·⑥ SQL에 `pg_input_is_valid(detail, 'jsonb')`를 넣었습니다.
    - 잘린 11/7 줄도 오류 없이 `error` 칸에 "기록 잘림 — 전체 결과는 Vercel 로그"로 보입니다.
    - 정상 기준도 새 형식으로 바꿨습니다: `purged_consult` = `{}`, `consult_licenses_sweep` = `{"required": false}`, `instagram_tokens` = `{"skipped": true}`.
  - 로컬 DB에서 잘린 줄과 새 형식 줄을 넣고(되돌림) 두 SQL을 돌려 확인했습니다.
- 새 형식이 처음 기록되는 실행은 **11/8 03:00**입니다.
- tasks.json에 P16-9(done)를 추가했습니다.

---

## 운영 확인 결과 모음
| 시점 | check:prod | 운영 스모크 |
|---|---|---|
| P21-13 적용 직후 (15:30) | 17/17 | 21/21, AI 0 |
| #52 병합·배포 뒤 (15:40) | 17/17 | 21/21, AI 0 |
| #55 병합·배포 뒤 (15:52) | 17/17 | 21/21, AI 0 |
| #56 병합·배포 뒤 (15:54) | 17/17 | 21/21, AI 0 |

## PR 상태
| PR | 내용 | 상태 |
|---|---|---|
| #52 | P21-13 나머지 | 병합 15:40  (운영 적용 15:29) |
| #55 | P16-9 크론 기록 잘림 수정 | 병합 15:52  |
| #56 | P18-7 스모크 본사 화면(값 있을 때만) | 병합 15:54  |
| #54 | P21-14 MAINTAIN·anon private USAGE·시퀀스 | **열림 — CI 전부 통과(security·unit·db·e2e-core·migration-check·label·Vercel), 승인 대기로 병합하지 않음** |
| 이 PR | 저녁 보고서 2차 | 병합 |

## 보류된 승인 요청
| 요청 | 내용 | 권장 |
|---|---|---|
| **P21-14 적용·병합 (#54)** | 표·뷰 MAINTAIN, anon private USAGE, 시퀀스 권한 회수. 위험도 P3, 데이터 변경 0 | 실데이터를 받기 전에 적용. 조건부 사전 승인 방식(P21-12·13과 같은 조건)이면 다음 자율 작업에서 진행 가능 |
| **사장님 본인 운영 본사 계정** | 운영에 본사 계정이 0개입니다. P23-5 사용권 부여, 자격증 검증, 운영 화면이 모두 본사 계정이 필요합니다 | 시범 전에 꼭. 방법: 운영 가입 → SQL Editor에서 `select private.grant_platform_admin('<이메일>');` |
| **스모크용 테스트 본사 계정** | 위 [2]의 선택지 A/B/C | A |
| (지난 보고서에서 이어짐) | Resend 메일 설정, 법률 검토 의뢰 발송, 테스트 데이터 삭제 승인, P23-5 실행 시점, 브랜치 보호 "최신 main 필요", 사용권 취소 기능 필요 여부 | — |

## 새 문제와 위험도
| 문제 | 위험도 | 상태 |
|---|---|---|
| 운영에 본사 역할 계정 0개 — 운영 본사 기능(사용권 부여·자격증 검증·운영 화면)을 쓸 사람이 없음 | **P2 (시범 전 필수, 보안 문제 아님)** | 사장님 할 일 |
| 크론 운영 기록 300자 잘림 → 아침 점검 SQL 오류 | P3 | #55로 수정, 11/8 03:00부터 새 형식 |
| 표·뷰 MAINTAIN, anon private USAGE, 시퀀스 권한 | P3 | #54 승인 대기 |
| `test-admin@winter-partner.test`가 강사 역할(이름과 다름) | 참고 | 테스트 데이터 정리 때 함께 정리 |

---

## 사장님이 돌아와서 할 일 (우선순위순)
1. **운영 본사 계정 만들기 (P2, 시범 전 필수).** 사장님 이메일로 운영(`https://winter-partner.vercel.app`)에 가입합니다(강사·샵 등록은 하지 않습니다). 그다음 Supabase SQL Editor에서 `select private.grant_platform_admin('<그 이메일>');`을 실행합니다. 이 계정이 있어야 P23-5(시범 샵 사용권 부여)를 할 수 있습니다.
2. **#54(P21-14) 적용·병합 승인.** 위험도 P3이고, 실데이터를 받기 전에 하길 권합니다. "조건부 사전 승인"으로 주시면 P21-12·13과 같은 조건으로 진행하겠습니다.
3. **스모크용 테스트 본사 계정을 정해 주세요.** 선택지 A(추천)면 1번과 같은 방법으로 `test-hq@winter-partner.test`를 만들고, 비밀번호는 `.env.rehearsal.local`에만 넣어 주세요. 다음 배포부터 스모크가 본사 화면 2개를 함께 봅니다.
4. **11/8 아침 점검(약 5분).** `docs/ops-check.md`의 ①·⑥을 새 SQL로 돌립니다. 11/8 03:00 줄이 `ok = true`이고 `purged_consult`가 `{}`, `consult_licenses_sweep`가 `{"required": false}`면 정상입니다. 11/7 줄은 "기록 잘림"으로 보이는 것이 정상입니다.
5. **시범을 막는 항목(지난 보고서에서 이어짐):** 메일(Resend) 설정, 법률 검토 의뢰 발송, 테스트 데이터 삭제 승인. 삭제할 때 `test-admin`과, 만들었다면 `test-hq`도 함께 지웁니다.
6. **P23-5 실행 시점:** 1번 본사 계정이 생기고, 타타타렌탈샵 가입과 카카오 채널 연결이 끝난 뒤 정해 주세요.
7. **선택:** 브랜치 보호의 "병합 전 최신 main 필요", 사용권 취소 기능 필요 여부.
