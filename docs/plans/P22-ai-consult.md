# P22 AI 상담 — 구현 계획

설계: `docs/ai-consult/README.md` (사장님 결정 6개 반영, 2026-11-05). 이번 범위는 P22-1·P22-2(로컬 개발·테스트). 외부 채널 연동(P22-3·4)·실제 AI 평가는 다음 단계.

## P22-1 스키마·안내 정보 화면 (브랜치 `task/P22-1`, PR #18)
1. pgTAP 먼저(`supabase/tests/consult.test.sql`): 다른 샵·강습팀·강사·본사 0건(shop1 대조군), 비밀 열 읽기 금지, messages·conversations 직접 쓰기 금지, 웹훅 RPC 서버 전용, channel_message_id 중복 거부, 평문 비밀·해시 아닌 id 거부, 상담 상한 300 별도, 새 샵 기본 템플릿.
2. 마이그레이션 `20261105114656_consult_schema.sql`: 표 6개 + inquiries 확장, RPC 4개, ai_gate 상담 상한, 기본 템플릿(비활성) 트리거·기존 샵 채우기.
3. `crypto.ts`(AES-256-GCM `v1.<base64>`, HMAC-SHA256) — 단위 테스트 먼저.
4. `/shop/ai-consult/knowledge` + `knowledge.ts` 검증 — E2E(390px 편집 → 사용 → 켜기 → 끄기, 감사 기록).
5. 문서: CLAUDE.md 예외, 설계 문서 결정, `.env.local.example`, `docs/pending-migrations.md`(원격 적용 뒤 병합).

## P22-2 상담 엔진 (브랜치 `task/P22-2`, P22-1 위)
1. `client.ts`: 호출별 `timeoutMs`·`retries`, 요청 제한 단위 `rateSubject` — 단위 테스트 먼저.
2. `src/lib/ai/consult/`: `rules.ts`(규칙·채널 길이) → `kb.ts`(검색) → `prompt.ts`(system·인용 블록·스키마·검증) → `amounts.ts`(금액 대조) → `engine.ts`(판정).
3. 가짜 모델 `consult/mock.ts`(AI_MOCK·단위 테스트), 분류 케이스 `engine.test.ts`(사실 9·사람 8·인젝션 6·금액 2·꺼짐/상한/실패 7·내용/로그 3·길이 2 등 39개), 실제 API 평가 `consult.eval.test.ts`(AI_EVAL=1에서만).

## P22-3 카카오 어댑터·웹훅 (브랜치 `task/P22-3`, main 위)
1. 단위 먼저: `src/lib/channels/kakao/adapter.test.ts`(요청 해석·봇 id·응답 JSON·콜백 주소 허용·콜백 1회·상담톡 껍데기), `webhook.test.ts`(3.4초 즉답/3.6·4초 콜백, 콜백 실패 failed·재시도 없음, 콜백 꺼짐 skipped, 중복 발화, 샵·대화 요청 제한, 꺼진 채널·토큰·봇 id 불일치·해시 키 없음 기본 안내, 고지, 로그에 원문 없음, Request → Response).
2. `types.ts`(공통) → `format.ts` → `adapter.ts`·`cstalk.ts` → `webhook.ts`(deps 주입) → `deps.ts`(서비스 키 + RPC) → 라우트 `POST /api/webhooks/kakao/[token]`(after).
3. 요청 제한 `consult_shop`·`consult_conversation`(`limits.ts`, `docs/rate-limits.md`). 마이그레이션 없음(고지 표시·열린 문의 갱신은 서비스 키 update).
4. E2E `e2e/ai-consult-kakao.spec.ts`: 가짜 모델 지연(`[가짜:지연]`) + localhost 가짜 콜백 서버(`KAKAO_CALLBACK_ALLOW_LOCAL=1`, 시험용 `CONSULT_HASH_KEY`는 playwright 설정에만).
5. 사장님 설정 안내 `docs/kakao-setup.md`.

## 다음 (P22-4~8)
설계 문서 "구현 단계" 표. 각 단계 브랜치 → PR → CI → 사장님 보고 → 병합. 마이그레이션은 원격 적용 승인 뒤.
