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
- [~] 1. 세션 관리 — JWT 만료, 리프레시 회전·재사용 감지, Time-box, 비활성 타임아웃, signOut scope, 앱 유휴 자동 로그아웃(관리자는 더 짧게)
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
