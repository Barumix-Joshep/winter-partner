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
- [ ] 2. RLS — public 모든 표 RLS, 역할별 정책, 다른 샵·다른 강사 차단, 전속 강사에게 입찰 공고 숨김
- [ ] 3. 서버 측 권한 검사 — API·서버 액션의 역할·소유권 검사, IDOR
- [ ] 4. 비밀값 — 번들·공개 env·로그·히스토리, .gitignore, gitleaks 히스토리 스캔
- [ ] 5. 인증 설정 — 비밀번호 정책, 유출 비밀번호 차단, 이메일 인증, OTP 만료, 로그인 rate limit, Redirect URL, 관리자 MFA
- [ ] 6. Storage — 비공개 버킷, signed URL 짧은 만료, 형식·크기 제한, 버킷 정책
- [ ] 7. DB 함수 — SECURITY DEFINER search_path, anon/authenticated 실행 권한, 동적 SQL, `supabase db lint`·Security Advisor
- [ ] 8. 입력 검증·오류 처리 — 서버 검증, 금액·정산 범위, 오류 메시지 누출
- [ ] 9. 웹 보안 헤더·쿠키 — CSP, HSTS, frame-ancestors, Referrer-Policy, 쿠키 속성, CORS
- [ ] 10. 남용 방지 — 쓰기 API rate limit, 중복 입찰
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
