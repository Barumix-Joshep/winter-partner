# 겨울파트너 (winter-partner)

스키·스노보드 렌탈샵·강습팀과 강사를 잇는 B2B 플랫폼. 첫 시즌(2026-27)은 웹(PWA)으로 출시하고, 비시즌에 Expo 앱으로 전환한다.
기획서: https://claude.ai/artifact/VbmTLagR7R2TnJ3AA2u39p · 진척 대시보드: https://claude.ai/artifact/2wvojmwJmZTNoJFv7YRu4S

## 스택
- Next.js 16 (App Router, `src/`), TypeScript, Tailwind 4
- Supabase: Postgres + Auth + Realtime + Storage. 스키마는 `supabase/migrations/`에만 둔다 (대시보드에서 직접 고치지 않는다)
- 알림: 카카오 알림톡(승인 전까지 웹푸시), 정산서: PDF/Excel
- 배포: Vercel

## 도메인 규칙 (기획서에서 확정된 것 — 코드가 이를 어기면 버그다)
- 모든 샵 데이터는 `shop_id`로 격리하고 RLS로 강제한다. `shops.type`은 rental_shop / lesson_team.
- 강사는 플랫폼 공용 프로필. 전속(shop_instructors)으로 묶인 강사는 프리랜서 등록이 불가하고, 입찰 공고를 볼 수 없다.
- 입찰은 프리랜서(2단계: 팀)만. 선정은 관리자가 고르며 금액을 조정할 수 있다.
- 배정 시 다른 샵 강습과 시간이 겹치면 막는다.
- 손님 취소: 강사에게 즉시 알림, 강습 취소, 정산 제외. 강사 일방 취소: 정산 제외 + instructor_penalties에 점수.
- 정산: 월 단위, 샵별·강사별. 프리랜서 3.3% 원천세. 송금은 수기, 시스템은 정산서와 "지급 완료" 체크만.
- 손님 정보: 샵 관리자만 연락처를 본다. 강사는 레벨·메모만.
- 자격증은 본사가 검증한 뒤에만 공개 프로필에 표시한다.
- 1단계에서는 대금 중개(PG)를 하지 않는다.
- AI 기능(P14): AI는 제안만 하고 확정은 사람이 한다(폼 미리 채우기·추천·초안). AI 출력을 DB에 바로 쓰지 않는다.
- AI에 보내는 개인정보는 최소로(`src/lib/ai/redact.ts`): 연락처·이메일·보호자 정보는 보내지 않고, 샵에 이미 있는 손님 이름은 "손님A"처럼 치환한다. 접수 문자 속 처음 보는 이름은 남을 수 있어 재위탁 고지(P14-5) 대상이다. 자격증 이미지는 강사 동의 안내 후에만.
- `ANTHROPIC_API_KEY`가 없거나 샵·플랫폼 설정에서 끄면 모든 화면이 기존 수동 흐름으로 그대로 동작해야 한다. E2E는 AI 끈 상태가 기본.
- AI 비용 상한: 샵별 하루 호출 수(기본 200), 플랫폼 월 비용 상한. 넘으면 조용히 끄고(수동 흐름) 관리자에게 알린다.

## 작업 방식
- Superpowers 플러그인을 쓴다(.claude/settings.json). 새 기능은 brainstorming → writing-plans → executing-plans(또는 subagent-driven-development) 순서, 구현은 test-driven-development, 버그는 systematic-debugging, 완료 선언 전에는 verification-before-completion을 따른다. 계획 문서는 `docs/plans/`에 둔다.
- 작업 단위는 진척 대시보드의 번호(P1-1 …)다. 한 작업을 끝내면: lint·typecheck 통과 → 커밋(`feat(P1-1): …`) → 대시보드 상태 갱신.
- 막힌 작업(blocked)은 건너뛰고 다음 작업으로 간다. 막힌 이유는 대시보드 메모에 적는다.
- 푸시 전에는 pre-push 훅(보안 점검·린트·타입 검사)이 반드시 통과해야 한다. --no-verify로 우회하지 않는다. 실패하면 원인을 고치고, 오탐일 때만 해당 줄에 security-check: allow 주석을 단다
- 되돌리기 어려운 결정(결제, 외부 계정, 데이터 삭제)은 멈추고 묻는다.
- Next.js 16은 학습 데이터와 다르다. `node_modules/next/dist/docs/`의 문서를 먼저 읽고 코드를 쓴다.
- 화면은 모바일 우선. 샵 관리자 화면은 데스크톱도 지원, 강사 화면은 모바일만.
- 화면 디자인은 프로토타입(https://claude.ai/artifact/G5669gR3KAecVFXBBPxGSA)을 따른다. 남색 #0F1E3D, 파랑 #1E4FD8, Noto Sans KR.
- 비밀값은 `.env.local`에만. 커밋하지 않는다.

## 명령
- `npm run dev` · `npm run build` · `npm run lint` · `npx tsc --noEmit`
- `npx supabase db push --linked` (원격 프로젝트 winter-partner에 마이그레이션 적용). 새 마이그레이션 파일명은 `npx supabase migration new <이름>`으로 만든다
