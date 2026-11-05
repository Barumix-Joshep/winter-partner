# 보안 점검 체크리스트

상태: `[ ]` 미점검 · `[~]` 진행 중 · `[x]` 완료 · `[!]` 사람 조치 필요.
루프 한 번에 한 항목. 코드 수정은 `security/<항목>` 브랜치(푸시만, 병합은 사장님 검토 뒤), 이 문서와 `docs/tasks.json` 추가분은 `security/checklist` 브랜치.

## 스택 요약 (2026-11-05 파악)
- **웹**: Next.js 16.4 App Router(`src/app`), React 19, cacheComponents·부분 사전 렌더링. 쓰기는 서버 액션(`src/app/**/actions.ts`)과 라우트 2개(`src/app/api/notify`, `src/app/api/maintenance` — 크론, `CRON_SECRET`). 세션 갱신은 `src/proxy.ts`(getClaims), 화면 가드는 `src/lib/auth/session.ts`(`requireArea`)·`src/components/area-shell.tsx`.
- **인증**: Supabase Auth 이메일·비밀번호(+OAuth 가입 경로), `@supabase/ssr` 쿠키 세션. 역할은 `profiles.role`(platform_admin / shop_admin / instructor), 샵 소속은 `shop_members`.
- **DB**: Supabase Postgres, 스키마는 `supabase/migrations/`만. 접근 제어는 RLS + security definer RPC(`private` 스키마 도움 함수). 서비스 키 클라이언트는 `src/lib/supabase/admin.ts`(서버 전용). Edge Function 없음(`supabase/functions` 없음).
- **Storage**: 강사 자격증 업로드(`src/lib/instructor/cert.ts`).
- **테스트**: `npm test`(vitest), `npx supabase test db`(pgTAP, `supabase/tests`), `npx playwright test`(E2E, 로컬 Supabase), `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run security`(자체 보안 점검, pre-push 훅·CI).
- **운영**: Vercel(main 병합 = 배포), Supabase 무료 요금제 프로젝트 winter-partner 1개, CI는 GitHub Actions(임시 로컬 Supabase).
- 원격 설정은 `npx supabase config diff`(읽기 전용)로만 본다. `config push`·`db push`·원격 SQL은 하지 않는다.

## 점검 항목
- [!] 1. 세션 관리 — JWT 만료, 리프레시 회전·재사용 감지, Time-box, 비활성 타임아웃, signOut scope, 앱 유휴 자동 로그아웃(관리자는 더 짧게)
- [x] 2. RLS — public 모든 표 RLS, 역할별 정책, 다른 샵·다른 강사 차단, 전속 강사에게 입찰 공고 숨김
- [x] 3. 서버 측 권한 검사 — API·서버 액션의 역할·소유권 검사, IDOR
- [x] 4. 비밀값 — 번들·공개 env·로그·히스토리, .gitignore, gitleaks 히스토리 스캔
- [!] 5. 인증 설정 — 비밀번호 정책, 유출 비밀번호 차단, 이메일 인증, OTP 만료, 로그인 rate limit, Redirect URL, 관리자 MFA
- [!] 6. Storage — 비공개 버킷, signed URL 짧은 만료, 형식·크기 제한, 버킷 정책
- [!] 7. DB 함수 — SECURITY DEFINER search_path, anon/authenticated 실행 권한, 동적 SQL, `supabase db lint`·Security Advisor
- [!] 8. 입력 검증·오류 처리 — 서버 검증, 금액·정산 범위, 오류 메시지 누출
- [!] 9. 웹 보안 헤더·쿠키 — CSP, HSTS, frame-ancestors, Referrer-Policy, 쿠키 속성, CORS
- [!] 10. 남용 방지 — 쓰기 API rate limit, 중복 입찰
- [ ] 11. 개인정보 — 수집 최소화, 암호화, 마스킹, 주민번호 미수집, 로그
- [ ] 12. 감사 로그 — 배정·선정·정산 금액·취소·벌점 기록, 수정 불가
- [ ] 13. 의존성 — npm audit high/critical

## 항목별 기록

### 1. 세션 관리 — [!] (코드 수정 완료, 서버 설정은 사람 조치)
근거(원격 값은 `npx supabase config diff` 읽기 전용 비교, 2026-11-05):
- JWT 만료 `jwt_expiry = 3600`(1시간) — 원격도 같음(차이 없음). 적정. `supabase/config.toml` `[auth]`.
- 리프레시 토큰 회전 `enable_refresh_token_rotation = true`, 재사용 허용 `refresh_token_reuse_interval = 10`초 — 원격 같음. 재사용 감지 동작(10초 뒤 옛 토큰 재사용 시 세션 폐기). 적정.
- 세션 Time-box·비활성 타임아웃: 원격 `timebox = 0s`, `inactivity_timeout = 0s`(꺼짐). 로컬 config는 주석 상태. → 리프레시 토큰이 계속 갱신되는 한 로그인이 무기한 유지된다. **문제.**
- 로그아웃: `src/app/login/actions.ts` `signOutSession()`의 `supabase.auth.signOut()` 기본 scope는 `global`(auth-js `GoTrueClient.signOut` 주석: "the default scope is 'global'") → 그 사용자의 모든 기기 리프레시 토큰 폐기. 적정. 로그아웃 뒤 뒤로 가기 차단은 P18-4(`components/logout-button.tsx`).
- 앱 쪽 유휴 자동 로그아웃: 없었다. **문제.** → 고침.

조치(코드): 브랜치 `security/session-idle-logout` 커밋 `25df620`(푸시, 병합 안 함).
- `src/lib/auth/idle.ts` 기준: 본사 30분 · 샵 2시간 · 강사 7일. `src/components/idle-logout.tsx`를 `AreaShell`(본사·샵·강사 구역)에 넣음. 마지막 조작 시각은 localStorage `wp:last-active`에 `{at, sid}`로 탭끼리 공유, 세션 id(JWT `session_id`)가 다르면 새 로그인으로 보고 지난 기록 무시. 1분마다·화면이 다시 보일 때·첫 화면에서 확인. 넘기면 `signOutIdle()`(scope `local`, 이 기기만) → `/login?reason=idle` 안내.
- 테스트: `e2e/idle-logout.spec.ts` 5개(page.clock으로 시간 앞당김) — 수정 전 3개 실패 확인 → 수정 뒤 통과(3회 반복 15/15). `src/lib/auth/idle.test.ts` 4개. 전체 E2E(운영 빌드) 74 통과, 단위 271, pgTAP 통과, 린트(경고 2개는 기존 `admin/pilot`)·타입·빌드 통과.
- **기능 영향(병합 전 확인)**: 병합·배포 뒤 본사 30분·샵 2시간 조작이 없던 화면은 다음 확인 때 로그인 화면으로 간다(다른 기기 세션은 유지). 강습 카운터에 샵 화면을 켜 두고 2시간 넘게 안 만지는 경우 다시 로그인해야 한다 — 시범 샵이 불편하면 `IDLE_LIMIT_MS.shop`만 늘리면 된다. 배포 직후에는 기록이 없어 그때부터 센다(기존 사용자 즉시 강제 로그아웃 없음). 알림·도움말 화면(구역 밖)은 감시하지 않는다.

사람 조치(`docs/tasks.json` P21-1):
- Supabase 대시보드 → 프로젝트 winter-partner → **Authentication → Sessions** → "Enforce time-box user sessions" **7일(168h)**, "Inactivity timeout" **24시간**. 이유: 탈취된 리프레시 토큰·잃어버린 기기의 세션을 서버에서 끊는다(앱 쪽 유휴 로그아웃은 브라우저 안의 조치라 토큰 자체는 막지 못한다). 서버 설정은 역할 구분 없이 전체에 걸리므로 관리자용 짧은 기준은 앱 쪽 기준이 맡는다.
- 이 설정은 Supabase **Pro 이상** 요금제 기능(확인 필요: 결정 전에 요금 페이지 재확인) → 백업 때문에 검토 중인 Pro 전환(`docs/backup-plan.md`)과 함께 결정. 바꾼 뒤 `supabase/config.toml` `[auth.sessions]`도 같은 값으로 맞춘다.
- `security/session-idle-logout` 브랜치 검토·병합(PR 만들어 CI 통과 뒤).

| 날짜 | 항목 | 발견 | 조치 | 커밋 |
|---|---|---|---|---|
| 2026-11-05 | 1. 세션 관리 | 서버 Time-box·비활성 타임아웃 꺼짐, 앱 유휴 로그아웃 없음 | 앱 유휴 로그아웃 추가(본사 30분·샵 2시간·강사 7일), 서버 설정은 P21-1 | 25df620 (security/session-idle-logout) |

### 2. RLS — [x] (정책 문제 없음, 빠진 표를 테스트로 고정)
근거(로컬 DB, 마이그레이션 전부 적용 상태, 2026-11-05):
- public 표 43개 모두 `relrowsecurity = true`, 정책 1개 이상(`pg_class`·`pg_policies` 조회). 이미 `supabase/tests/rls_matrix.test.sql` 1)이 "모든 표에 RLS", 2) anon·public 쓰기 정책 없음, 3) 조건 없는(`true`) 쓰기 정책 없음을 강제한다.
- 뷰 2개: `customer_consent_state`는 `security_invoker=true`(밑 표 RLS 적용). `instructor_assignments`는 소유자 권한 뷰지만 정의에 `where instructor_id = private.my_instructor_id()`, `security_barrier`, anon 권한 회수(`20261102151000_access_hardening.sql:16-23`), 테스트 `access_hardening.test.sql:27-35`. 의도된 설계.
- 역할별 실제 조회(shop1 관리자 / 다른 샵 / 강습팀 / 프리랜서 김·박 / 전속): 다른 샵·팀은 shop1 강습·강습료·손님 연결·배정·입찰·제안·전속·정산 0행. 강사에게 보이는 배정·제안·입찰은 모두 자기 것. 다른 강사 자격증은 승인된 것만. 강사 가용 시간은 샵 전체에 보임 — 강사 찾기(P3)용 설계.
- 전속 강사 입찰 공고 숨김: `rls.test.sql`·`bids.test.sql`에 있고, 새 테스트에서 "프리랜서에게는 보이는 공고"를 대조로 다시 확인.

조치(테스트): 브랜치 `security/rls-role-tests` 커밋 `c999c24`(푸시, 병합 안 함). `supabase/tests/rls_roles.test.sql` 12개 — 다른 샵·강습팀·프리랜서·다른 강사의 조회 차단, ID를 알 때의 수정·삭제 0행, 강사의 "지급 완료" 변경 불가, 본인은 보인다는 대조. 표마다 RLS를 꺼 보면(job_prices, job_customers, shop_members, pay_type_log, lesson_corrections, settlement_items, notifications, push_subscriptions, instructor_penalties, exclusive_invites) 이 테스트가 실패하는 것을 확인. 전체 pgTAP 583, 단위 267, E2E 핵심 55, 린트·타입·빌드 통과.

| 날짜 | 항목 | 발견 | 조치 | 커밋 |
|---|---|---|---|---|
| 2026-11-05 | 2. RLS | 정책 문제 없음. 행렬 테스트에 빠진 표 다수 | 역할별 차단 테스트 12개 추가 | c999c24 (security/rls-role-tests) |

### 3. 서버 측 권한 검사 — [x] (1건 고침)
근거(2026-11-05):
- 구조: 서버 액션 32개 파일·라우트 6개. 쓰기·읽기는 거의 모두 사용자 세션 클라이언트(`src/lib/supabase/server.ts`)라 RLS·RPC 검사가 그대로 걸린다(UI 숨김에 기대지 않음). 폼에서 받은 shop_id를 그대로 쓰는 곳 없음(`formData.get("shop_id")` 검색 0건) — 샵은 서버가 `getMyShop(user.id)`로 정한다.
- 서비스 키(RLS 우회) 사용처 12곳을 하나씩 확인:
  - `shop/customers/summary-action.ts`: 손님을 세션 클라이언트로 `eq("shop_id", shop.id)` 조회해 확인한 뒤에만 `save_customer_summary`.
  - `instructor/actions.ts` `jobCustomerNames`: 손님 이름을 AI 보내기 전 가리는 데만 쓰고 돌려주지 않음.
  - `instructor/profile/cert-actions.ts` → `lib/ai/cert-read.ts`: 방금 세션 클라이언트로 만든 자기 자격증 행 id만.
  - `components/feedback-actions.ts`: 로그인 없이 의견, IP 요청 제한, user_id는 서버가 세션에서.
  - `join/[token]`, `consent/[token]`: 공개 토큰 흐름, IP·토큰 요청 제한 뒤 토큰 범위 RPC(`public_*`, anon 실행 권한 없음).
  - `api/maintenance/daily`, `api/notify/dispatch`: `Authorization: Bearer CRON_SECRET` 없으면 401.
  - `lib/notify/dispatch.ts`, `lib/ai/client.ts`, `lib/ops/rate-limit.ts`, `lib/ops/record.ts`: 서버 내부 기록·발송.
- 라우트: `settlements/[id]/pdf`는 로그인 확인 + 세션 클라이언트로 조회(RLS로 남의 정산서는 없음 → 404) + 접속 기록. `shop/settlements/export`는 로그인 401·샵 관리자 아니면 403, 자기 샵만. `shop/import/template`는 정적 양식. `auth/confirm`은 토큰 교환.
- RLS를 우회하는 security definer 함수: 로그인 사용자가 실행할 수 있는 50개 모두 본문에서 호출자를 확인(`auth.uid()`·`private.my_*`·멤버 확인 함수), anon 실행 가능 0개(`pg_proc` 조회). 함수별 상세는 항목 7.
- IDOR: 다른 샵의 강습·정산·입찰을 ID로 조회·수정 → 항목 2 테스트(`rls_roles.test.sql` 7~11: 0행)와 기존 `rls.test.sql`·`settlements.test.sql`·`bids.test.sql`.

발견·조치: `src/app/instructor/actions.ts` `tidyNote`(수업 메모 AI 정리)가 강사 역할만 보고, 강습이 RLS로 **보이기만 하면**(다른 샵 입찰 공고 포함) 그 샵 이름으로 AI를 불렀다 → 강사가 다른 샵 공고 id로 반복 호출하면 그 샵의 하루 AI 상한(200)과 사용 기록을 소진. 손님 정보 노출은 없음. 자기 배정(`instructor_assignments`)을 먼저 확인하게 고침. 브랜치 `security/server-authz` 커밋 `edfd78b`(푸시, 병합 안 함). 재현 테스트 `src/app/instructor/tidy-note.test.ts`(수정 전 1개 실패 → 수정 뒤 통과). 단위 269, pgTAP 583, E2E 핵심 55(메모 정리 E2E 포함), 린트·타입·빌드 통과. 기능 영향: 배정된 강습에서 쓰는 정상 흐름은 그대로.
- 참고(고치지 않음): 크론 비밀값 비교가 일반 문자열 비교(`!==`)다. 네트워크 너머 시간 차 공격은 현실적이지 않아 낮음 — 남김.

| 날짜 | 항목 | 발견 | 조치 | 커밋 |
|---|---|---|---|---|
| 2026-11-05 | 3. 서버 측 권한 검사 | tidyNote가 배정 확인 없이 다른 샵 AI 상한 사용 가능 | 자기 배정 확인 추가 + 재현 테스트 | edfd78b (security/server-authz) |

### 4. 비밀값 — [x] (노출 없음, 검사 범위 1건 고침)
근거(2026-11-05):
- `.gitignore:34` `.env*`, `:42` `.env*.local`, `:49` `/backups/`. 저장소에 올라간 env 파일은 `.env.local.example`뿐이고 값은 자리 표시자(`https://xxxx.supabase.co` 등, 비밀 키 칸은 비어 있음). 이력 전체에서 추가된 env 파일도 이것 하나.
- 공개 접두사 변수는 `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_ANON_KEY`·`NEXT_PUBLIC_VAPID_PUBLIC_KEY` 3개뿐(모두 공개용). `scripts/security-check.mjs:57-58`이 `NEXT_PUBLIC_*SERVICE_ROLE|SECRET`과 클라이언트 컴포넌트의 service role 사용을 막는다(pre-push 훅·CI).
- 서버 비밀(`SUPABASE_SERVICE_ROLE_KEY`·`ANTHROPIC_API_KEY`·`VAPID_PRIVATE_KEY`)을 읽는 파일은 모두 `import "server-only"`(클라이언트에서 가져오면 빌드 실패). `"use client"` 파일에서 서버 비밀·`supabase/admin` 사용 0건.
- 번들: 로컬 운영 빌드 `.next/static` 167개 파일에 `.env.local`의 서비스 키·VAPID 비밀 값 일치 0, `service_role`·`sk-ant-` 문자열 0. 운영 사이트(`winter-partner.vercel.app`) JS 12개에서 JWT 0·`service_role`·`sk-ant-`·`sb_secret_`·`PRIVATE KEY` 0.
- 로그: `console.*` 11곳 모두 오류 이름·코드·상태만(키·토큰·요청 원문 없음).
- 이력: gitleaks 8.24.3(공식 이미지)로 모든 브랜치 130커밋 검사 → **유출 0건**.

발견·조치: CI `security.yml`의 "커밋 이력 전체 비밀값 검사" 단계가 실제로는 gitleaks-action 기본값(main 푸시 `--log-opts=-1`, PR은 PR 커밋)이라 이력 전체를 보지 않았다(로그 `gitleaks cmd: ... --log-opts=-1`). 단계 이름을 실제 범위로 고치고, 매주 월 04:00 KST·수동 실행 때 `--log-opts=--all` 전체 검사를 추가. 로컬 명령도 `docs/ci.md`에 적음. 브랜치 `security/secrets-scan` 커밋 `8a7b663`(푸시, 병합 안 함). 같은 명령 로컬 실행 유출 0·종료 0, 린트·타입·단위 267·빌드·보안 점검 통과. 키 교체 필요 없음.

| 날짜 | 항목 | 발견 | 조치 | 커밋 |
|---|---|---|---|---|
| 2026-11-05 | 4. 비밀값 | 노출 없음. CI gitleaks가 이력 전체를 안 봄 | 매주 전체 이력 검사 추가·단계 이름 수정 | 8a7b663 (security/secrets-scan) |

### 5. 인증 설정 — [!] (비밀번호 규칙 코드 수정, 대시보드 설정·MFA는 사람 조치)
근거(원격은 `npx supabase config diff` 읽기 전용, 2026-11-05):
- **비밀번호**: 앱은 가입·재설정에서 8자 이상 검사(`src/lib/auth/validate.ts`, `src/app/login/actions.ts`). 그러나 Auth 서버는 `minimum_password_length = 6`(원격 같음), `password_requirements` 없음 → 공개 키로 Auth API를 바로 부르면 6자·숫자만 비밀번호로 가입·변경 가능. **문제.**
- **유출 비밀번호 차단**(HaveIBeenPwned): 켜져 있지 않음(Supabase Pro 기능 — 확인 필요).
- **이메일 인증**: 원격 `enable_confirmations = true`. 적정. `double_confirm_changes = true`(이메일 변경 시 양쪽 확인). `secure_password_change = false` — 로그인한 지 오래된 세션으로 비밀번호를 바꿀 때 재인증을 요구하지 않음(낮음, 켜기 권장).
- **OTP**: 원격 `otp_length = 8`, `otp_expiry = 3600`(1시간), 재발송 간격 `max_frequency = 1m`. 만료 1시간은 길다(권장 15분).
- **로그인 rate limit**: Auth 서버 `sign_in_sign_ups = 30`(원격, IP당 5분), 앱 `src/lib/ops/limits.ts` 실패 기준 IP 30·계정 10/10분, 가입 IP 10/시간, 재설정 IP 10·계정 3/시간(`docs/rate-limits.md`, `e2e/rate-limit.spec.ts`). 적정.
- **Redirect URL**: 원격 `site_url = https://winter-partner.vercel.app`, 허용 목록 `https://winter-partner.vercel.app/auth/confirm` 하나. 와일드카드 없음, 적정. 앱 쪽 `safeNext`가 외부 주소 이동(열린 리다이렉트)을 막고 테스트 있음.
- **MFA**: 원격 TOTP 등록·인증 켜짐. 그러나 앱 어디에서도 MFA를 쓰지 않음(`mfa.`·`aal2` 검색 0건) → 본사 관리자도 비밀번호만으로 로그인. **권장 미충족.**

조치(코드): 브랜치 `security/password-policy` 커밋 `f20ef38`(푸시, 병합 안 함).
- 규칙 하나로: `passwordProblem()` = 8자 이상 + 영문·숫자(가입·재설정 공용), 화면 안내 "(8자 이상, 영문·숫자 포함)", 서버 약한 비밀번호 오류도 한국어로.
- `supabase/config.toml` `minimum_password_length = 8`, `password_requirements = "letters_digits"`(로컬·CI 서버가 강제).
- 테스트: `e2e/password-policy.spec.ts` — anon 키로 Auth API 직접 가입(6자/숫자 없음/영문 없음) → `weak_password` 거부 3개 + 가입 화면 안내 1개. **이전 설정에서 3개 실패 확인 → 새 설정에서 통과.** 단위 `validate.test.ts` 4개 추가. 단위 271, pgTAP, 전체 E2E 73, 린트·타입·빌드 통과.
- 기능 영향: 새 가입·비밀번호 재설정부터 영문·숫자를 함께 넣어야 한다. 기존 비밀번호는 그대로 로그인된다(규칙은 바꿀 때만 검사).

사람 조치:
- `docs/tasks.json` P21-2 — Supabase 대시보드 → winter-partner → **Authentication → Sign In / Providers → Email**: Minimum password length **8**, Password requirements **Letters and digits**, **Secure password change** 켜기, Email OTP Expiration **900초**. **Authentication → Attack Protection**(또는 Policies): "Prevent use of leaked passwords" 켜기(Pro 필요 시 Pro 전환 때). 이유: 앱 검사는 Auth API 직접 호출로 건너뛸 수 있으므로 서버가 강제해야 한다. 바꾼 뒤 `npx supabase config diff`로 로컬과 같은지 확인(제가 읽기 전용으로 확인합니다).
- `docs/tasks.json` P21-3 — 본사 관리자 MFA 필수화: **결정 필요(확인 필요)** — 관리자 계정이 하나라 휴대폰 분실 시 복구 방법(복구 코드 보관 또는 두 번째 관리자)을 먼저 정해야 한다. 정해지면 등록·인증 화면, `/admin` 접근 시 aal2 요구, 본사 전용 RPC에서 JWT `aal` 확인을 구현. 샵 관리자 MFA는 선택 기능으로 권장.

| 날짜 | 항목 | 발견 | 조치 | 커밋 |
|---|---|---|---|---|
| 2026-11-05 | 5. 인증 설정 | 서버 비밀번호 6자·조합 없음(앱 검사 우회 가능), MFA 미사용, OTP 1시간 | 앱·로컬 서버 규칙 8자+영문·숫자, 대시보드는 P21-2, MFA는 P21-3 | f20ef38 (security/password-policy) |

### 6. Storage — [!] (구멍 1건 고침, 운영 적용은 승인 필요)
근거(로컬 DB, 2026-11-05):
- 버킷은 `certs` 하나: `public = false`, `file_size_limit = 4194304`(4MB), `allowed_mime_types = {image/jpeg, image/png, image/webp, application/pdf}`(`20261101150600_certs.sql:4-6`) — Storage 서버가 크기·형식을 강제. SVG·HTML 불가. 앱도 `src/lib/instructor/cert.ts` `parseCert`로 4MB·형식 검사, 경로는 서버가 `<instructor_id>/<무작위 uuid>.<확장자>`로 정함(`cert.ts:32-34`).
- 정책(`storage.objects`): 올리기·읽기·지우기 모두 자기 폴더(`private.my_instructor_id()`), 읽기는 본사도. 덮어쓰기(update) 정책 없음 → 덮어쓰기 불가. 샵·다른 강사는 파일 0건(`certs.test.sql:27-29`).
- signed URL: 본사 검증 화면만 `createSignedUrls(paths, 600)`(10분, `src/app/admin/page.tsx:103`). 공개 URL(`getPublicUrl`) 사용 0건. 적정.
- **문제**: 삭제 정책이 자기 폴더면 무엇이든 허용 → 강사가 Storage API로 **승인된 자격증 파일**만 지우고 같은 경로에 다른 파일을 올리면 행은 "승인" 그대로 증빙이 바뀐다(공개 프로필은 발급처·등급 글자만 보여 손님 쪽 노출은 없음, 본사 감사 증빙 훼손).

조치: 브랜치 `security/storage-cert-guard` 커밋 `f6c813e`(푸시, 병합 안 함). 마이그레이션 `20261105041909_storage_cert_guard.sql` — `private.cert_file_locked(name)`(승인된 행이 가리키는 파일인가) 추가, 삭제 정책에 `and not private.cert_file_locked(name)`. 승인 전 파일·행 없는 파일(`cert-actions.ts`의 저장 실패 정리, 자격증 행 삭제 뒤 정리)은 그대로 지운다. 테스트 `supabase/tests/storage_certs.test.sql` 5개(**수정 전 2개 실패 확인** → 통과). pgTAP 전체, 단위 267, 전체 E2E 69(자격증 업로드·삭제 포함), 린트·타입·빌드 통과. `docs/pending-migrations.md` 등록, migration-check 통과.
- 기능 영향: 강사가 승인된 자격증을 "삭제"하면 행은 지워지고(프로필에서 빠짐) 그 뒤 파일 정리는 행이 없으므로 그대로 된다. 행을 남긴 채 파일만 지우는 경로만 막힌다.
- 참고(항목 10으로): 자기 폴더에 올리는 파일 개수 제한은 없다(4MB씩 반복 업로드 가능).

사람 조치: `docs/tasks.json` P21-4 — 병합과 운영 DB 적용 승인. 정책·함수만이라 데이터 변경 없음(`migration-preflight`로 확인 후 보고).

| 날짜 | 항목 | 발견 | 조치 | 커밋 |
|---|---|---|---|---|
| 2026-11-05 | 6. Storage | 승인된 자격증 파일을 강사가 지우고 바꿔치기 가능 | 삭제 정책에 승인 파일 잠금, 운영 적용은 P21-4 | f6c813e (security/storage-cert-guard) |

### 7. DB 함수 — [!] (search_path 4개 고침, 운영 적용·Security Advisor 확인은 사람)
근거(로컬 DB, main 마이그레이션 전부, 2026-11-05):
- security definer 함수: public 65개·private 44개, **모두 `search_path` 고정**(`proconfig` 조회, 대부분 `set search_path = ''`).
- 실행 권한: anon이 실행할 수 있는 **public** 함수 0개(definer·invoker 모두). 로그인 사용자가 부를 수 있는 public definer 50개는 본문에서 호출자 확인(항목 3). private 함수는 PUBLIC 기본 실행 권한이 남아 anon도 실행 권한은 있지만, `private` 스키마는 API에 노출되지 않아(`config.toml [api] schemas = ["public","graphql_public"]`, 원격도 같음) REST로 부르면 `PGRST106 Invalid schema: private` — 직접 호출 불가. RLS 정책이 anon 요청에서도 private 판단 함수를 쓰므로 회수하지 않는다(회수하면 anon 조회가 권한 오류).
- 동적 SQL: 함수 본문 `EXECUTE` 0건.
- `npx supabase db lint --level warning`: 보안 문제 0, 경고 1건(`public.bid_price_reference` 쓰지 않는 변수 `n`, 보안 무관).
- **문제(낮음)**: search_path를 고정하지 않은 invoker 함수 4개 — `private.penalty_points_for`·`withholding_amount`·`consents_immutable`·`access_logs_immutable`. 표를 참조하지 않아 실제 위험은 낮지만 Security Advisor `function_search_path_mutable` 대상.
- 참고: `public.instructor_assignments`는 소유자 권한 뷰(Advisor `security_definer_view`로 나올 수 있음) — 정의에 자기 배정 필터·security_barrier·anon 회수, 테스트 있음. 의도된 설계(항목 2).

조치: 브랜치 `security/db-functions` 커밋 `ddd4b43`(푸시, 병합 안 함). 마이그레이션 `20261105043347_fn_search_path.sql`(4개 `set search_path = ''`, 데이터 변경 없음). 테스트 `supabase/tests/db_functions.test.sql` 3개 — search_path 미고정 함수 없음(**수정 전 실패 확인**: 4개 나열), anon의 public definer 실행 없음, 동적 SQL 없음. pgTAP 전체, 단위 267, E2E 핵심 55, 린트·타입·빌드 통과. `docs/pending-migrations.md` 등록.

사람 조치: `docs/tasks.json` P21-5 — 병합·원격 적용 승인. Supabase 대시보드 → **Advisors → Security Advisor** 결과(항목 이름·대상)를 알려 주시면 체크리스트에 반영합니다(제가 대시보드에 접근하지 않음).

| 날짜 | 항목 | 발견 | 조치 | 커밋 |
|---|---|---|---|---|
| 2026-11-05 | 7. DB 함수 | search_path 미고정 invoker 함수 4개(낮음). definer·권한·동적 SQL 문제 없음 | search_path 고정 + 회귀 테스트, 적용·Advisor 확인은 P21-5 | ddd4b43 (security/db-functions) |

### 8. 입력 검증·오류 처리 — [!] (DB 범위 제약 추가, 운영 적용은 승인 필요)
근거(2026-11-05):
- **서버 검증**: zod는 쓰지 않고 서버 쪽 전용 파서로 검증한다 — `src/lib/auth/validate.ts`(로그인·가입), `src/lib/shop/job.ts` `parseJob`(시간·인원·금액, 지난 시간·12시간 초과 차단), `src/lib/instructor/validate.ts`(프로필), `src/lib/instructor/cert.ts`(파일), `src/lib/feedback/parse.ts`, `src/lib/form.ts`. 서버 액션은 FormData를 이 파서에 먼저 통과시킨다. 화면의 `required`·`minLength`에 기대지 않는다.
- **금액·정산**: P19에서 `jobs.instructor_rate`·`assignments.final_rate`·`bids.amount` 1원~1,000만 원, `job_prices.customer_price` 0~1,000만 원 CHECK, RPC는 `private.check_won`으로 한국어 안내. 정산서(`settlements` gross·withholding·net, `settlement_items.amount`)는 `generate_settlements`(definer)가 위 값으로만 계산하고, 샵·강사가 직접 고치는 경로는 RLS로 0행(직접 시도 확인).
- **문제**: DB 제약이 없어 API로 바로 쓰면 범위를 벗어나던 값 — 강사가 `instructors.base_rate`를 -1·20억으로(강사 찾기 화면에 표시), 샵이 `exclusive_invites.exclusive_rate`를 -1로, 샵이 `jobs.student_count`를 -5로(진행 중 강습) 저장할 수 있었다(직접 시도로 확인). 앱의 강습료 검사도 숫자만 보고 상한이 없었다.
- **오류 누출**: 서버 액션은 DB 오류를 고정 한국어 문구로 바꿔 돌려준다(`error.message.includes(...)`로 골라 우리 문구만). 원문을 그대로 넘기는 곳은 `src/app/shop/jobs/[id]/actions.ts:129` 하나로, 우리가 RPC에서 던진 한국어 문구 4종일 때만. 오류 화면(`src/components/error-screen.tsx`)은 오류 번호(digest)만 보이고 내용·스택은 운영 기록(ops_events)으로. 라우트는 고정 문구(401·403·404). Next 운영 빌드는 서버 오류 메시지를 화면에 보내지 않는다.

조치: 브랜치 `security/input-ranges` 커밋 `3418041`(푸시, 병합 안 함). 마이그레이션 `20261105044233_input_ranges.sql` — `instructors_base_rate_range`·`exclusive_invites_rate_range`·`shop_instructors_rate_range`(null 또는 1~1,000만 원), `jobs_student_count_by_type`(1:1=1, 1:2=2, 그룹=3~10). **적용 전 운영 위반 0건**(읽기 조회). 앱 강습료 검사에 같은 범위. 테스트 `supabase/tests/input_ranges.test.sql` 8개(**수정 전 7개 실패 확인** → 통과), 단위 1개. pgTAP 전체, 단위 268, 전체 E2E 69, 린트·타입·빌드 통과. 기능 영향: 정상 화면 흐름은 같다(화면이 이미 같은 범위로 막고 있음).

사람 조치: `docs/tasks.json` P21-6 — 병합·원격 적용 승인(적용 직전 위반 수를 다시 세어 보고).

| 날짜 | 항목 | 발견 | 조치 | 커밋 |
|---|---|---|---|---|
| 2026-11-05 | 8. 입력 검증·오류 처리 | 강사 단가·전속 단가·수강 인원 DB 제약 없음(API로 음수·과대값 저장). 오류 누출 없음 | CHECK 제약 4개 + 앱 상한, 적용은 P21-6 | 3418041 (security/input-ranges) |

### 9. 웹 보안 헤더·쿠키 — [!] (쿠키 고침, CSP 강제 전환은 결정 필요)
근거(운영 `https://winter-partner.vercel.app` 응답 헤더, 2026-11-05):
- `strict-transport-security: max-age=63072000; includeSubDomains`(2년), `x-frame-options: DENY` + CSP `frame-ancestors 'none'`, `x-content-type-options: nosniff`, `referrer-policy: strict-origin-when-cross-origin`, `permissions-policy: camera=(), geolocation=(), payment=(), usb=(), microphone=(self)` — 설정 `next.config.ts`, 테스트 `e2e/security-headers.spec.ts`. 적정.
- CSP: **Report-Only**(`CSP_ENFORCE = false`, `next.config.ts:5`). `default-src 'self'`, 외부 연결은 Supabase만, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`. 다만 부분 사전 렌더링 때문에 nonce 없이 `script-src 'unsafe-inline'`. 주요 화면 16개 CSP 위반 0(E2E). 강제 전환은 시범 기기 확인 뒤 결정(P19부터 남은 결정).
- CORS: `access-control-allow-origin: *`는 Vercel이 캐시한 정적 셸(`x-vercel-cache: HIT`, 로그인 정보 없는 화면 틀)과 `manifest.webmanifest`에만 붙는다(Vercel 기본). 로그인이 필요한 동적 응답(`/settlements/[id]/pdf`, `/api/*`)에는 없음. `*`일 때 브라우저는 쿠키를 실은 교차 출처 응답을 읽게 해 주지 않으므로 위험 낮음 — 기록만. 서버 액션은 Next가 Origin과 Host를 대조(CSRF 방지).
- **문제: 세션 쿠키** — `@supabase/ssr` 기본값 `httpOnly: false`·Secure 없음(`node_modules/@supabase/ssr/dist/module/utils/constants.js`)이라 `document.cookie`로 `sb-…-auth-token`(액세스·리프레시 토큰)을 읽을 수 있었다. CSP가 Report-Only + `unsafe-inline`이라 XSS가 생기면 토큰 탈취로 이어진다.

조치: 브랜치 `security/auth-cookies` 커밋 `98c1dd2`(푸시, 병합 안 함). `src/lib/supabase/cookie-options.ts`(`httpOnly: true`, 운영 빌드 `secure: true`, `sameSite: "lax"`)를 `src/proxy.ts`·`src/lib/supabase/server.ts`의 `createServerClient`에 적용. 이 앱은 브라우저용 Supabase 클라이언트가 없어(`createBrowserClient` 0건) 동작이 같다. 테스트 `e2e/auth-cookies.spec.ts`(**수정 전 실패 확인** → 통과: HttpOnly·Lax·운영 빌드 Secure, `document.cookie`에 토큰 없음). 전체 E2E(운영 빌드) 70, 단위 267, pgTAP, 린트·타입·빌드 통과. 기능 영향: 기존 쿠키는 다음 세션 갱신 때 새 속성으로 다시 쓰인다(로그아웃 없음). 나중에 브라우저에서 Supabase Realtime을 직접 쓰면(AI 상담 인박스 등) 이 결정을 다시 봐야 한다.

사람 조치: `docs/tasks.json` P21-7 — CSP 강제 전환 결정(시범 샵 실제 기기에서 위반 없으면 `CSP_ENFORCE = true`). (선택) HSTS `preload` 등록은 도메인을 정한 뒤.

| 날짜 | 항목 | 발견 | 조치 | 커밋 |
|---|---|---|---|---|
| 2026-11-05 | 9. 웹 보안 헤더·쿠키 | 세션 쿠키 HttpOnly·Secure 없음, CSP Report-Only | 쿠키 HttpOnly·Secure, CSP 강제는 P21-7 | 98c1dd2 (security/auth-cookies) |

### 10. 남용 방지 — [!] (횟수 제한 추가, 운영 적용은 승인 필요)
근거(2026-11-05):
- **이미 있는 제한**(`src/lib/ops/limits.ts`, `docs/rate-limits.md`, `e2e/rate-limit.spec.ts`): 로그인 실패 IP 30·계정 10/10분, 가입 IP 10/시간(+ Auth 서버 `sign_in_sign_ups` 30/5분), 재설정 메일, 공개 동의·셀프 등록 링크 열람·제출, 의견 보내기, AI 호출 사용자 30/10분 + 샵 하루 200 + 월 비용 상한.
- **중복 방지**(고유 색인): 입찰 `bids_one_open_per_instructor`(공고·강사당 진행 중 하나), 팀 입찰 공고당 하나(`team_bids.test.sql`), 의뢰 `job_offers_job_id_instructor_id_key`, 전속 제안 대기 하나, 사업자 변경 요청 대기 하나, 푸시 구독 endpoint.
- **문제**: 상대에게 알림이 가는 쓰기에 횟수 제한이 없었다 — `place_bid`·`place_team_bid`는 재입찰(금액 변경)마다 샵에 알림, `send_job_offer`는 의뢰마다 강사에게 알림(함수 본문에서 `notifications` insert 확인). 승인된 샵·강사가 반복 호출하면 알림을 쏟아낼 수 있었다. 강사 폴더의 자격증 파일 수에도 상한이 없어 Storage API로 4MB씩 계속 올릴 수 있었다(항목 6에서 넘김). 강습 등록(`create_job`)·입찰 공고는 알림을 만들지 않아 제외.

조치: 브랜치 `security/write-limits` 커밋 `c21e1cc`(푸시, 병합 안 함). 마이그레이션 `20261105050316_write_limits.sql` — `private.hit_write_limit`(기존 `private.rate_limits` 고정 창, 로그인 사용자만 셈), 트리거 `limit_bids`(insert·금액 변경, 10분 30번)·`limit_job_offers`(1시간 100번), 저장소 올리기 정책에 `private.cert_folder_has_room`(폴더 30개). 한도는 `private.app_settings`의 `limit_*`로 조정. 앱은 초과 시 "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." 안내(입찰·팀 입찰). `docs/rate-limits.md`에 근거 추가. 테스트 `supabase/tests/write_limits.test.sql` 6개(**수정 전 3개 실패 확인** → 통과). pgTAP 전체, 단위 267, 전체 E2E 69, 린트·타입·빌드 통과. 기능 영향: 정상 사용량(E2E 전체에서 의뢰 11·입찰 8회)보다 한참 높은 한도라 평소에는 걸리지 않는다.

사람 조치: `docs/tasks.json` P21-8 — 병합·원격 적용 승인.

| 날짜 | 항목 | 발견 | 조치 | 커밋 |
|---|---|---|---|---|
| 2026-11-05 | 10. 남용 방지 | 입찰·의뢰(알림 발생) 횟수 제한 없음, 자격증 파일 수 무제한 | DB 트리거·정책 한도, 적용은 P21-8 | c21e1cc (security/write-limits) |
