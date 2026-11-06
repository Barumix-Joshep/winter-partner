# AI 상담 (P22) — 설계

렌탈샵이 카카오톡 채널·인스타그램 DM으로 받는 손님 상담을 AI가 돕는다. FAQ(가격·영업시간·위치·정책)는 AI가 바로 답하고, 예약·협상·불만처럼 판단이 필요한 문의는 사장님께 초안을 보여 주고 사장님이 처리한다.

상태: **설계 승인, 구현 중** (2026-11-05 사장님 결정 6개 반영 — 맨 아래 "사장님 결정"). P22-1(스키마·안내 정보 화면)·P22-2(상담 엔진)부터.

유료 서비스 분리(사용권·사용량·본사 화면, P23): **[paid-service-design.md](paid-service-design.md)** (설계 초안, 2026-11-06).
- P23-2 구현(`20261106015911_consult_license.sql`): 사용권 표·판정·게이트·차단. 켜짐 스위치 `private.app_settings.consult_license_required`가 **false(기본)면 지금 동작 그대로**, true면 사용권 없는 샵은 AI를 부르지 않고 모든 문의를 사장님께 넘긴다. E2E에서 스위치를 켜는 곳은 `e2e/ai-consult-license.spec.ts` 하나(`e2e/local-sql.ts`, 로컬 DB 컨테이너만)이고 끝나면 되돌린다.
- P23-3 구현(마이그레이션 없음): 본사 화면 `/admin/ai/consult`(`src/app/admin/ai/consult/`, 계산·입력 해석 `src/lib/ai/consult/license-admin.ts`). 표는 `consult_admin_license_overview`, 버튼은 본사 RPC 7개, 이력은 `audit_events`(consult_*). 스위치와 상관없이 동작한다. E2E `e2e/ai-consult-admin-license.spec.ts`(스위치를 켜지 않음).
- 시범 샵 체험 사용권 부여·스위치 켜기 순서(P23-5): **[pilot-license-runbook.md](pilot-license-runbook.md)**.

## 스택 요약 (0단계 파악, 2026-11-05)
- **웹·서버**: Next.js 16.4 App Router(`src/app`), React 19, cacheComponents. 서버 코드는 **서버 액션**(`src/app/**/actions.ts`)과 **라우트 핸들러**(`src/app/**/route.ts`). Supabase Edge Functions는 쓰지 않는다(`supabase/functions` 없음) → 웹훅도 라우트 핸들러로 만든다. Vercel 배포(main 병합 = 운영 배포), 크론은 Vercel Cron + `CRON_SECRET`(`src/app/api/maintenance/daily`, `src/app/api/notify/dispatch`).
- **DB**: Supabase Postgres. 스키마는 `supabase/migrations/`만(`npx supabase migration new <이름>`). 원격 적용은 사장님 승인 뒤 `npx supabase db push --linked`, 대기 목록 `docs/pending-migrations.md`.
- **인증·RLS 패턴**: Supabase Auth 쿠키 세션(`@supabase/ssr`, `src/proxy.ts`). 화면 가드 `requireArea("shop")`(`src/lib/auth/session.ts`), 내 샵 `getMyShop(user.id)`(`src/lib/shop/my-shop.ts`). 샵 자료 정책은 `private.is_shop_member(shop_id)`(예: `inquiries`의 `member_all`). RLS를 우회하는 쓰기는 `security definer` RPC + `private` 도움 함수, 서버 전용 서비스 키 클라이언트 `src/lib/supabase/admin.ts`(공개 토큰 흐름·서버 작업만).
- **AI**: 호출은 이미 `src/lib/ai/client.ts`의 `callStructured` 한 곳으로 모여 있다 — 도구 호출(JSON 스키마) 강제, 15초 타임아웃·1회 재시도, 샵별 하루 호출 상한(기본 200)·플랫폼 월 비용 상한(`gate`), 사용량 `ai_usage`, 기능 켜기/끄기(`isAiEnabled`, `/shop/ai`·`/admin/ai`), 테스트용 가짜 모델(`AI_MOCK=1`, `src/lib/ai/mock.ts`). 개인정보 가리기 `src/lib/ai/redact.ts`. → 요청서의 `lib/ai/llm.ts`는 만들지 않고 **`client.ts`를 확장**한다(관례).
- **기존 "문의" 표**: `public.inquiries`(id, shop_id, customer_id, channel, outcome, lost_reason, created_at, RLS `member_all`) — 0001에 있고 화면·코드에서 아직 안 쓴다. → **새로 만들지 않고 확장**한다.
- **환경변수**: 비밀값은 `.env.local`(로컬)·Vercel 환경변수(운영)만. 바꾸는 것은 사장님(`docs/ci.md`). 공개 접두사 `NEXT_PUBLIC_`에는 비밀을 두지 않는다.
- **테스트**: `npm test`(vitest, `src/**/*.test.ts`), `npx supabase test db`(pgTAP, `supabase/tests`), `npx playwright test`(E2E, 로컬 Supabase, AI는 가짜 모델), `npm run lint`, `npx tsc --noEmit`, `npm run build`. CI는 PR마다 security·unit·db·e2e-core.
- **작업 번호**: `docs/tasks.json`, 단계 `"22 AI 상담"`, 작업 `P22-1 …`(P21은 보안 점검).

## 플랫폼 제약 (공식 문서 확인, 2026-11-05)
| 항목 | 내용 | 출처 |
|---|---|---|
| 카카오 스킬 응답 시간 | **5초**. 넘기면 콜백 사용: 즉시 `{"version":"2.0","useCallback":true}`(template 없이, `data`로 대기 문구 가능) → `userRequest.callbackUrl`로 POST(본문은 스킬 응답 형식) | [AI 챗봇 콜백 가이드](https://kakaobusiness.gitbook.io/main/tool/chatbot/skill_guide/ai_chatbot_callback_guide) |
| 카카오 콜백 URL | **1회만** 사용, 유효시간은 문서 안에서 5분/1분으로 엇갈림 → **1분 안에 보내는 것으로 설계**. 블록마다 관리자센터에서 콜백을 켜야 함(별도 신청 절차는 문서에 없음 — 확인 필요). 봇 테스트에서는 콜백이 안 되고 배포 채널에서만 됨 | 같은 곳 |
| 카카오 말풍선 | simpleText 최대 1000자(500자 넘으면 "전체 보기"로 접힘), 출력 1~3개, 버튼 라벨 14자, 상담 연결 버튼은 action `operator`(상담 연결 플러그인 필요) | [응답 형식](https://kakaobusiness.gitbook.io/main/tool/chatbot/skill_guide/answer_json_format) |
| 카카오 무료 챗봇 | 손님이 말을 걸 때만 응답(먼저 보내기 불가) → 사장님 답장은 채널 1:1 채팅에서 직접 | — |
| 인스타 메시지 창 | 손님 마지막 메시지 후 **24시간**. Human Agent 태그로 **7일**까지(사람이 보낸 답장만, 자동화에 쓰면 정책 위반, 별도 앱 심사) | [Messaging API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api) |
| 인스타 글자 수 | 텍스트 **UTF-8 1000바이트 이하** → 한글은 약 330자. 요청서의 "500자 이내"로는 넘칠 수 있어 **채널별 바이트 상한**으로 자른다 | 같은 곳 |
| 인스타 권한 | `instagram_business_basic`, `instagram_business_manage_messages`. 우리가 소유하지 않은 샵 계정에 쓰려면 **Advanced Access(앱 심사·비즈니스 인증)** 필요. 심사 전에는 앱 역할이 있는 테스트 계정만 | 같은 곳 |
| 메타 웹훅 | GET `hub.mode=subscribe`·`hub.verify_token`·`hub.challenge`, POST `X-Hub-Signature-256: sha256=<앱 시크릿으로 만든 SHA256 HMAC>`. 실패하면 36시간 동안 재전송 → **중복 제거 필수**, 200을 빨리 돌려준다 | [Webhooks](https://developers.facebook.com/docs/graph-api/webhooks/getting-started) |
| 인스타 장기 토큰 | 60일 유효·갱신(문서 재확인 필요 — P22-4는 오프라인이라 확인 못 함, 첫 테스터 연결 때 확인. 코드는 `expires_in`을 따르고 없으면 60일) | — |

## 아키텍처
```
카카오 스킬 요청 ─┐                              ┌─ auto: 채널 어댑터 send (카카오는 응답 본문/콜백, 인스타는 Send API)
인스타 웹훅 ──────┼→ 채널 어댑터 receive → 정규화 메시지 → 상담 엔진 ─┤
(상담톡: 껍데기) ─┘   (검증·중복 제거·저장)                         └─ escalate: inquiry·초안 저장 → 인박스(Realtime) → 사장님
```
- **채널 어댑터**(`src/lib/channels/<채널>/`): `receive(raw) → NormalizedMessage | null`(서명·토큰 검증, 스토리 답장·멘션·에코 제외), `send(conversation, text, opts)`, `canSend(conversation, now, opts) → {ok, tag?, reason}`. 공통 타입 `src/lib/channels/types.ts`. `KakaoCsTalkAdapter`는 세 함수가 "지원 안 함"을 돌려주는 껍데기.
- **상담 엔진**(`src/lib/ai/consult/engine.ts` `runConsult`, P22-2 구현): 채널을 모른다. 입력 `{shopId, conversationId, text, channel}`, 출력 `{mode:'auto'|'escalate', reply, confidence, intent, draft?, extracted?, reason?, promptVersion}`. 순서: (1) 고정 규칙(`rules.ts` — 빈 글·1000자 초과·인젝션 문구 → AI를 부르지 않고 unknown) (2) 안내 정보 검색(`kb.ts` — 켜 둔 항목을 질문과 가까운 순서로) (3) `callStructured` 1회(feature `consult`, 대화별 요청 제한 `consult:<대화 id>`) (4) 스키마 검증(`prompt.ts` `parseConsult`) (5) 판정 — intent가 price/hours/location/policy/faq이고, 신뢰도 ≥ 샵 기준(0.85)이고, 답 속 금액이 모두 안내 정보에 있고(`amounts.ts`), 답에 연락처가 없고, 샵이 자동 응대를 켰을 때만 auto. 인사(smalltalk)·예약·협상·불만·모름은 escalate(사장님 결정 2: 안내 정보 사실만 자동) (6) 채널 길이(`fitChannel` — 카카오 500자, 상담톡 1000자, 인스타 1000바이트). AI가 꺼졌거나 상한(하루 300)·실패면 escalate. escalate의 `reason`은 화면·지표용이고 손님 글은 담지 않는다. 로그에는 길이·의도·판정만.
- **LLM 호출**: `client.ts`에 `consult` 기능 추가, 호출별 `timeoutMs`·`retries` 옵션을 더한다(카카오 경로는 3.5초·재시도 0, 넘으면 콜백 경로). 모델은 기존 설정 `private.app_settings`에 `ai_model_consult` 키를 더해 `ai_gate`가 고르게 하고(기본 `claude-haiku-5-5`, 지연이 짧은 모델), 프롬프트 버전은 상수 `CONSULT_PROMPT_VERSION`으로 두고, 메시지 행에 버전을 남긴다.
- **프롬프트 인젝션**: KB·샵 정보·규칙은 system, 손님 글은 항상 user 턴의 인용 블록. "지시 무시/시스템 프롬프트" 류는 규칙으로 먼저 unknown. 모델 출력은 스키마 검증 후에만 쓰고, 답변 속 금액은 KB 금액 집합과 대조해 하나라도 없으면 escalate.

## 데이터 모델 (모든 표 shop_id + RLS `private.is_shop_member(shop_id)`, 웹훅 쓰기는 security definer RPC)
- **shop_channels**: `channel`('kakao'|'instagram'|'kakao_cstalk'), `public_token`(웹훅 주소용 무작위값, 고유), `external_id`(카카오 봇 id / 인스타 계정 id), `credentials_enc`·`webhook_secret_enc`(앱에서 AES-256-GCM 암호화한 `v1.<base64>` 텍스트만, DB CHECK), `enabled`, `token_expires_at`. 샵 관리자는 비밀 열을 읽지 못한다(열 권한).
- **shop_consult_settings**(구현 때 분리, 샵당 하나): `auto_reply_enabled`(기본 false), `ai_disclosure_text`, `disclose_first_reply`(기본 true), `confidence_threshold`(기본 0.85). 채널을 연결하기 전에도 안내 정보·켜기를 준비할 수 있게 채널과 따로 둔다. 바꾸기는 RPC `set_consult_settings`(켜기·끄기는 `audit_events`에 남김).
- **shop_knowledge**: `kind`('price'|'hours'|'location'|'policy'|'faq'|'free_text'), `title`, `content`, `is_active`, `updated_at`. 샵 생성 시 기본 FAQ 템플릿(비활성 상태로 넣어 사장님이 채운 뒤 켬). 처음엔 임베딩 없이 활성 KB 전체를 프롬프트에(샵당 글자 수 상한).
- **conversations**: `channel`, `channel_id → shop_channels`, `external_user_hash`(HMAC-SHA256, 키는 서버 비밀), `display_name`, `status`('bot'|'waiting_owner'|'owner'|'closed'), `last_customer_message_at`, `summary`, `disclosed_at`(AI 고지 보낸 시각).
- **messages**: `conversation_id`, `shop_id`, `role`('customer'|'ai'|'owner'|'system'), `text`, `intent`, `confidence`, `prompt_version`, `channel_message_id`(채널별 고유 → **중복 제거·replay 방지**), `sent_at`, `delivery_status`('pending'|'sent'|'failed'|'skipped'), `tag`(인스타 HUMAN_AGENT 등).
- **inquiries 확장**(기존 표): `conversation_id`, `type`('lesson'|'rental'|'booking'|'complaint'|'other'), `extracted`(JSON: 날짜·인원·종목·레벨), `contact_enc`(연락처는 암호화, 화면 마스킹), `ai_draft`, `status`('open'|'replied'|'converted'|'closed'). 기존 `outcome`·`lost_reason`·`customer_id`는 그대로 둔다(손님 카드 연결용).
- **ai_feedback**: `message_id`, `shop_id`, `kind`('wrong'|'edited'), `corrected_text`, `created_by`, `created_at`.
- **보존**(사장님 결정): 대화·메시지·피드백은 90일 뒤 매일 정리 작업(`api/maintenance/daily`, P22-6)이 삭제. 문의는 사장님이 "강습 등록"으로 넘긴 것(`status='converted'`)만 연락처(`contact_enc`)를 지운 뒤 남기고 나머지는 함께 삭제. 구현은 아래 "보안·개인정보 — 보존 기간 정리".

## 화면
- `/shop/ai-consult/knowledge`: 종류별 KB 편집, 채널 연결 상태, AI 응대 켜기/끄기, 고지 문구, 임계값(고급).
- `/shop/ai-consult/inbox`: 대기 문의 목록(Realtime), 대화 상세(전체 메시지·AI 초안·추출 정보), 버튼 [수정] [승인·발송(인스타)] [복사(카카오)] [KB에 추가] [AI 답변 틀림], 자동응답 기록 탭. 카카오 대화에는 "무료 챗봇은 먼저 말을 걸 수 없어요 — 채널 1:1 채팅에서 답해 주세요" 표시. 모바일 우선.
- 구현(P22-5): `src/app/shop/ai-consult/inbox/`(`page.tsx` 목록·자동응답 기록 탭, `[id]/page.tsx` 상세, `reply-panel.tsx` 버튼, `live.tsx` 갱신, `actions.ts`), 도움 함수 `src/lib/channels/inbox.ts`, 승인 발송 `src/lib/channels/owner-reply.ts`. 샵 메뉴 "AI 상담"에 사장님 대기 수.
  - **갱신 방식(Realtime 대신 서버 확인)**: 로그인 쿠키가 HttpOnly(#26)라 브라우저에 Supabase 토큰이 없고 브라우저용 Supabase 클라이언트도 두지 않는다 → 브라우저에서 Supabase Realtime을 구독하지 않는다(토큰을 브라우저에 내보내지 않기 위해). 대신 화면이 보이는 동안 10초마다 서버 액션 `inboxPulse`(세션 클라이언트, RLS — 대기 수 1개 + 마지막 메시지 시각 1개, 행은 읽지 않음)를 묻고 값이 바뀌었을 때만 `router.refresh()`로 다시 그린다. 화면이 숨으면 멈춘다(`visibilitychange`). 열린 화면 하나당 10초에 가벼운 쿼리 2개. 입력 중인 답장은 refresh 뒤에도 남는다. 유휴 자동 로그아웃(P21-1)은 사용자 조작만 세므로 이 확인이 로그인을 늘리지 않는다.
  - 쓰기: 사장님 답장(role owner)·문의 replied·대화 owner는 RPC `consult_owner_reply`(샵 멤버 확인, 카카오·상담톡은 `skipped`만, 감사 기록), 닫기는 `consult_close_conversation`, [AI 답변 틀림]은 `ai_feedback` 직접 insert(RLS `member_insert`, 고친 글이 있으면 `edited`), [KB에 추가]는 안내 정보 저장 액션(꺼진 채로 미리 채움). 마이그레이션 `20261105141851_consult_inbox.sql`.
  - [승인·발송(인스타)]: 손님 인스타 id는 해시만 있어 보낼 수 없으므로, 웹훅이 손님 id를 암호화해 `conversations.reply_to_enc`에 둔다(샵 관리자도 못 읽는 열). 발송 때만 서버가 서비스 키로 읽어 풀고 어댑터 `send(approvedByOwner=true)` — 24시간 안 RESPONSE, 24시간~7일은 `META_HUMAN_AGENT=1`일 때만 HUMAN_AGENT, 7일 초과 거부(거부는 기록하지 않고 이유만 표시). 대화가 우리 샵인지는 먼저 세션(RLS)으로 확인한다. 이 열이 생기기 전에 온 대화는 "인스타그램 앱에서 직접 답해 주세요".
  - [복사(카카오)]: 클립보드 쓰기만(읽지 않음) → `skipped`로 기록·문의 replied. 연락처는 서버에서 풀어 `maskContact`한 값만 화면에 보낸다.
- 본사 `/admin/ai`에 지표 카드(자동응답률·에스컬레이션률·평균 첫 응답시간·틀림 건수·샵별 LLM 비용).
  - **P22-7 구현**: 본사는 상담 표를 RLS로 못 읽으므로 숫자만 돌려주는 security definer RPC `consult_admin_metrics(p_from, p_to)`·`consult_admin_shop_costs(p_from, p_to)`(본사만, 출력은 숫자·uuid만, 기간 1~400일)로 집계한다. 마이그레이션 `20261105151914_consult_admin_metrics.sql`. 기간은 한국 시간 달(기본 이번 달, `?month=YYYY-MM`, 최근 12개월 선택).
  - 자동응답률 = 손님 메시지 중 같은 대화의 바로 다음 메시지가 보낸 AI 답(role `ai`, `sent`)인 비율. 에스컬레이션률 = 손님 메시지가 있었던 대화 중 그 달 문의(`inquiries.conversation_id`)가 열린 대화 비율(대화당 1번). 첫 응답 시간 = 대화마다 그 달 첫 손님 메시지 → 첫 보낸 AI 답 또는 사장님 답장(`failed` 제외), 평균·중앙값. 틀림 = `ai_feedback` wrong·edited 수. 샵별 비용 = `ai_usage` feature `consult`의 호출·실패·비용, 한국 하루 최대 호출 ÷ 상한(300)·상한 닿은 날 수. 분모가 0이면 "—"(`src/lib/ai/consult/metrics.ts`).

## 채널 흐름
**카카오** `POST /api/webhooks/kakao/[token]`
1. token으로 shop_channels 찾기(없거나 꺼짐 → 기본 안내 응답). 봇 id 대조. `userRequest.user.id` 해시 → 대화 찾기/만들기. 발화 id(없으면 사용자+시각 해시)로 중복 제거.
2. 남은 시간 안(약 3.5초)에 엔진이 끝나면 바로 스킬 응답(simpleText ≤ 1000자, 실제 답은 500자 이내로 접힘 없게).
3. 넘기면 `useCallback:true` + 대기 문구로 응답하고, `after()`로 엔진을 끝낸 뒤 callbackUrl에 **한 번만** POST. 실패해도 재시도하지 않고 `delivery_status='failed'` + 인박스에 표시.
4. escalate면 "사장님께 전달했어요. 곧 1:1 채팅으로 답드릴게요." + 상담 연결(`operator`) 버튼.
5. 웹훅 인증: 카카오 스킬 요청에는 서명이 없다 → 추측할 수 없는 token 주소 + 봇 id 대조 + 샵별 요청 제한. (관리자센터에서 스킬 헤더 값을 지정할 수 있으면 비밀 헤더도 대조 — 1단계에서 확인)
6. 구현(P22-3): `src/lib/channels/kakao/`(`adapter.ts` 해석·봇 id·콜백 1회, `format.ts` 응답 JSON, `webhook.ts` 흐름, `deps.ts` DB·RPC, `cstalk.ts` 상담톡 껍데기), 공통 타입 `src/lib/channels/types.ts`. 발화 id가 요청에 없어(현재 문서) 손님·30초 구간·발화의 HMAC으로 중복을 막는다. 콜백 주소는 `https://*.kakao.com`만(요청 본문 값이라 SSRF 방지, 실제 도메인은 시범 때 확인). 블록 콜백이 꺼져 있고 3.5초를 넘기면 "사장님께 전달했어요" + 상담 연결로 답하고 늦은 AI 답은 `skipped`로 남겨 문의 초안으로. 같은 대화에 열린 문의가 있으면 새로 열지 않고 초안·추출 정보만 고친다. 요청 제한 `consult_shop`(10분 300)·`consult_conversation`(10분 20) — `docs/rate-limits.md`. 사장님 설정 순서는 **[docs/kakao-setup.md](../kakao-setup.md)**.

**인스타** `GET/POST /api/webhooks/instagram`
1. GET: verify token 대조 → challenge. POST: 원문 바이트로 `X-Hub-Signature-256` HMAC 검증, 실패 400. 200을 먼저 돌려주고 처리는 `after()`.
2. `mid`로 중복 제거(36시간 재전송 대비). 에코(우리가 보낸 것)·스토리 답장·스토리 멘션·리액션은 자동응답 제외(저장만).
3. `canSend`: 마지막 손님 메시지 후 24시간 이내 → 자동 발송 가능. 24시간~7일 → **사장님이 인박스에서 승인 버튼을 누른 경우에만** `HUMAN_AGENT` 태그로 발송(자동 경로에서는 코드가 거부). 7일 초과 → 발송 불가. 첫 자동응답에는 고지 문구(기본 켬).
4. 연결: Instagram 로그인 OAuth로 샵 계정 연결(아래 결정 1), 토큰 암호화 저장, 매일 정리 작업이 만료 7일 전 갱신.
5. 구현(P22-4): `src/lib/channels/instagram/`(`config.ts` 환경변수 — 하나라도 없으면 기능 꺼짐·404·화면 "준비 중", `adapter.ts` 서명·해석·`canSend`·Send API, `webhook.ts` 흐름, `oauth.ts`·`connect.ts` 연결, `tokens.ts` 갱신, `deps.ts` DB). 라우트 `GET/POST /api/webhooks/instagram`, `GET /api/channels/instagram/connect`·`/callback`. 저장은 공통 `src/lib/channels/store.ts`(카카오와 같이 씀). mid가 200자를 넘으면 HMAC으로 줄여 중복 제거. escalate 안내("사장님께 전달했어요")는 대화에 열린 문의가 없을 때 한 번만 보낸다. 요청 제한은 카카오와 같은 `consult_shop`·`consult_conversation`(샵 한도는 답하지 않음, 대화 한도는 P22-6부터 AI 없이 escalate — "보안·개인정보"). 마이그레이션 `20261105133519_consult_instagram.sql`: `consult_record_reply`에 `p_tag`, 인스타 계정 하나 = 샵 하나, 연결(서버 전용)·해제(샵 멤버) RPC. Human Agent는 `META_HUMAN_AGENT=1`(심사 통과 뒤)일 때만 사장님 승인 경로에서 쓴다. 사장님 준비 순서는 **[docs/meta-setup.md](../meta-setup.md)**.
   - 확인 필요(오프라인이라 공식 문서 재확인 못 함): Human Agent가 Instagram 로그인 방식에서도 같은 이름·규칙인지, 장기 토큰 교환(`ig_exchange_token`)·갱신(`ig_refresh_token`) 주소와 만료(60일)·갱신 조건, `me?fields=user_id`가 웹훅 `recipient.id`와 같은 값인지, `me/subscribed_apps` 구독, Graph API 버전(기본 v24.0, `META_GRAPH_API_VERSION`으로 바꿈). 모두 설정·한 곳 코드로 두어 첫 테스터 연결 때 고친다.

## 보안·개인정보
P22-6에서 마무리했다. 시험: `src/lib/channels/privacy.test.ts`(카카오·인스타 웹훅과 엔진을 실제 의존성으로 돌리고 DB·Graph만 가짜), `src/lib/ai/consult/contact.test.ts`, `src/app/api/maintenance/daily/route.test.ts`, `supabase/tests/consult_retention.test.sql`, `e2e/ai-consult-inbox.spec.ts`("연락처 … 강습 등록").

- **웹훅 검증**: 카카오는 추측할 수 없는 token 주소 + 봇 id 대조, 인스타는 원문 바이트 `X-Hub-Signature-256` HMAC(틀리면 저장 전에 400). `channel_message_id` 고유 제약으로 replay·재전송 중복 방지.
- **요청 제한**(`docs/rate-limits.md`): 두 웹훅 모두 `consult_shop`(샵, 10분 300)·`consult_conversation`(대화, 10분 20)을 쓴다.
  - 샵 한도 초과: 저장·AI 없음. 카카오는 상담 연결 안내(카카오는 응답이 꼭 있어야 함), 인스타는 답하지 않는다.
  - 대화 한도 초과: 메시지는 저장(가린 글), **AI는 부르지 않고 escalate** — 카카오는 상담 연결 안내, 인스타는 열린 문의가 없을 때만 "사장님께 전달했어요" 한 번. 둘 다 사장님 문의를 연다(열린 문의가 있으면 거기에 합침).
  - AI 호출 자체도 대화 단위 `ai_user`(10분 30)를 따른다. 상담 하루 상한(샵별 300, `ai_consult_daily_calls_per_shop`)이나 플랫폼 월 비용 상한에 걸리면 `ai_gate`가 막고 엔진은 `ai_unavailable`로 escalate → 자동 답변 없이 상담 연결·문의(모델 호출 없음).
- **손님 id**: HMAC 해시(`hashExternalId`)만 저장. 인스타 답장용 손님 id는 `conversations.reply_to_enc`에 AES-GCM 암호화(P22-5, 샵 관리자도 못 읽는 열, 사장님 승인 발송 때만 서버가 푼다). AI에는 보내지 않는다.
- **연락처**(P22-6): 손님 글 속 전화·이메일은 **AI가 아니라 서버 규칙**(`src/lib/ai/consult/contact.ts`, `redact.ts`와 같은 정규식)으로 뽑는다.
  - 원문은 `encryptSecret`으로 암호화해 `inquiries.contact_enc`에만 둔다(`src/lib/channels/store.ts`, 키가 없으면 두지 않음). 연락처를 남긴 손님은 사장님이 연락해야 하므로 자동 답변을 했더라도 문의를 연다.
  - `messages.text`에는 가린 글(`010-****-1234`, `m***@example.com`)만 저장한다. AI에는 `redact`가 `[전화]`·`[이메일]`로 바꾼 글이 간다.
  - 화면은 가린 값만: 문의 연락처는 서버에서 풀어 `maskContact`, 메시지 글·목록 미리보기·자동응답 기록은 `displayText`(P22-6 전에 원문으로 저장된 글도 가림, 사장님이 쓴 답장만 그대로).
- **로그**: `console.*`·운영 기록(`ops_events`)에 손님 글·전화·이메일·손님 원래 id를 쓰지 않는다 — 길이·의도·경로·결과만. 매일 정리 작업 결과도 건수만.
- **쓰기 권한**: 웹훅 쓰기는 security definer RPC(서비스 키). 화면은 세션 클라이언트 + RLS. 문의 상태·연락처·대화 연결·초안은 RPC로만 바꾼다(P22-6에서 `inquiries` 고치기 권한을 열 단위로 줄임 — 샵 멤버가 직접 고칠 수 있는 열은 `customer_id·channel·outcome·lost_reason·type·extracted`).

### 보존 기간 정리 (사장님 결정 3, P22-6)
- 함수 `public.purge_consult_data()`(security definer, **service_role만** 실행 — 로그인 사용자·anon·본사 관리자 거부). 매일 정리 작업 `GET /api/maintenance/daily`가 손님 익명화·접속 기록 정리와 함께 부른다. 실패하면 작업 전체가 500 + 운영 기록(실패)으로 본사가 안다.
- 규칙(기준 90일):
  1. 마지막 활동(대화 생성·손님 마지막 메시지·마지막 메시지 중 가장 늦은 시각)이 90일 전인 대화 → 삭제(메시지·피드백 함께).
  2. 남는 대화 안에서도 90일 지난 메시지 → 삭제(피드백 함께).
  3. 지우는 대화의 문의: **"강습 등록"으로 넘긴 것(`converted`)만 남기고** 연락처(`contact_enc`)·대화 연결(`conversation_id`)·AI 초안(`ai_draft`, 손님 글로 만든 글)을 비운다(유형·추출 정보·등록 시각은 남김). 나머지 문의는 삭제. 대화와 이어지지 않은 문의(상담 이전 기능)는 건드리지 않는다.
- [강습 등록]: 대화 상세의 문의 정보 칸 버튼 → RPC `consult_convert_inquiry`(**샵 대표만**, 답장 전·답장함 문의만, 감사 기록 `consult_inquiry_converted`). 넘긴 뒤 "강습 만들기 →" 링크. 강습 자체는 사람이 강습 만들기 화면에서 등록한다(AI가 만들지 않는다).
- 마이그레이션 `20261105145008_consult_retention.sql`. **적용할 때는 데이터가 바뀌지 않는다**(함수·권한만). 삭제는 병합·배포 뒤 매일 정리 작업이 돌 때부터. 되돌리기는 파일 머리 주석(지운 상담은 백업에서만 되살린다).

## 기존 원칙과 바뀌는 점 (승인 필요)
- CLAUDE.md "AI는 제안만 하고 확정은 사람이 한다·AI 출력을 DB에 바로 쓰지 않는다" → **AI 상담 FAQ 자동응답만 예외**: 샵이 켠 경우에 한해 KB 범위의 사실만 손님에게 바로 답한다. 예약·금액 협상·불만·KB 밖은 여전히 사람이 처리. 승인되면 CLAUDE.md 도메인 규칙에 이 예외를 적는다.
- 개인정보: 손님이 보낸 글이 Anthropic으로 간다(현재 재위탁 고지 P14-5는 "접수 문자"까지만). 개인정보 처리방침·샵용 고지에 "카카오톡·인스타그램 상담 내용"을 추가해야 하고 법률 검토 항목에 넣는다. 카카오·메타도 처리 경로에 들어간다.

## 구현 단계 (docs/tasks.json "22 AI 상담")
| 번호 | 내용 | 끝났다는 기준 |
|---|---|---|
| P22-1 | 스키마(위 표, inquiries 확장)·RLS·RPC, 다른 샵 차단 pgTAP, 암호화·해시 유틸, KB 관리 화면, 기본 FAQ 템플릿 | pgTAP(다른 샵 토큰·관리자로 conversations·shop_knowledge 0건), 단위, E2E(KB 편집·켜기) |
| P22-2 | 상담 엔진(`lib/ai/consult`), client.ts 확장(타임아웃·재시도 옵션, `consult` 기능), 가짜 모델 응답 | 분류 케이스 20개 이상(가짜 모델 + 규칙), KB 밖 질문 escalate, 금액 대조, 인젝션 → unknown |
| P22-3 | 카카오 어댑터·웹훅(즉답/콜백 1회), 상담톡 껍데기, `kakao-setup.md` | 단위(4초 경계·콜백 1회·실패 기록), 라우트 E2E(가짜 콜백 서버). 실제 콜백은 배포 채널에서만 → 시범 단계 |
| P22-4 | 인스타 어댑터·웹훅(verify·서명)·OAuth 연결·토큰 갱신, 24시간·7일 강제 | 경계 테스트(23:59 통과, 24:01 거부, HUMAN_AGENT는 승인 경로만, 7일 초과 거부), 서명 실패 400 |
| P22-5 | 사장님 인박스(Realtime, 버튼 5개, 자동응답 기록) | E2E(가짜 웹훅 → 인박스 갱신 → 승인 발송/복사/틀림/KB 추가), 390px |
| P22-6 | 보안·개인정보 마무리(요청 제한·마스킹·로그·90일 삭제·상한 초과 escalate) | pgTAP·단위, 처리방침 문구 초안 |
| P22-7 | 지표 카드 | 단위(집계)·E2E |
| P22-8 | 시범: 타타타렌탈샵 카카오 채널 연결·실제 콜백 확인 | 사장님 승인 뒤, 실제 채널에서 즉답·콜백·escalate 1건씩 |

각 단계는 브랜치 → PR → CI → 병합. 마이그레이션은 단계마다 `docs/pending-migrations.md`에 올리고 원격 적용은 사장님 승인. **새 화면이 새 표를 읽으므로 병합 전에 원격 적용 순서를 정한다.**

## 사장님 결정 (2026-11-05)
1. **인스타 연결**: Instagram 로그인 방식(페이스북 페이지 불필요). 구현은 P22-4. Human Agent 태그가 이 방식에서도 같은지는 P22-4 착수 전에 공식 문서로 다시 확인.
2. **AI 원칙 예외**: 샵이 켠 경우에 한해 안내 정보 범위 사실(가격·영업시간·위치·정책)만 자동응답. 예약 확정·금액 협상·불만·안내 정보 밖 질문은 항상 escalate(초안만). CLAUDE.md 도메인 규칙에 적음.
3. **문의 보존**: 대화·메시지·피드백 90일 뒤 삭제, "강습 등록"으로 넘긴 문의만 연락처를 지운 뒤 보존.
4. **비용 상한**: 상담 전용 샵별 하루 300회(다른 AI 기능 200회와 별도, `ai_consult_daily_calls_per_shop`), 넘으면 자동응답을 멈추고 escalate. 플랫폼 월 비용 상한은 함께 쓴다.
5. **비밀값 이름**: `CONSULT_ENCRYPTION_KEY`(base64로 적은 32바이트), `CONSULT_HASH_KEY`(32자 이상). `.env.local.example`에는 설명만, 운영 값은 사장님이 Vercel에 넣는다. 메타 쪽 `META_APP_ID`·`META_APP_SECRET`·`META_VERIFY_TOKEN`은 P22-4에서.
6. **개인정보 문구**: 법률 검토 항목(P14-5·P13-7)에 합친다. 이번에는 아래 초안만.

### 개인정보 문구 초안 (초안 — 법률 검토 전)
> **초안 — 법률 검토 전.** 법률 검토 의뢰서(`docs/legal-review-packet.md` (d), main에 있음)의 질문 18~22와 함께 검토받는다. 공개 `/privacy`는 채널을 실제로 연결하기 전까지 바꾸지 않는다.

- 처리방침 4항(재위탁) Anthropic 줄에 추가할 문구: "AI 상담: 샵이 켠 경우 카카오톡 채널·인스타그램 DM으로 받은 손님 상담 글을 답변·초안 작성을 위해 보냅니다. 글 속 전화번호·이메일은 가린 뒤 보내고, 손님 카카오·인스타 계정 id는 보내지 않습니다(저장도 해시로만)."
- 처리방침 4항에 추가할 업체: "㈜카카오 — 카카오톡 채널 챗봇 메시지 전달", "Meta Platforms, Inc. (미국) — 인스타그램 DM 메시지 전달 [국외 이전 고지 법률 검토 필요]".
- 처리방침 3항(손님 정보)에 추가: "상담 기록: 카카오톡·인스타그램 상담 글·답변은 90일 보관 후 삭제합니다. 강습 등록으로 이어진 문의는 연락처를 지운 뒤 보관합니다."
- (P22-6 추가) 처리방침 3항 상담 기록 줄에 이어서: "상담 글 속 전화번호·이메일은 따로 암호화해 보관하고 화면에는 가운데를 가려 보여 줍니다. 인스타그램 답장을 보내기 위해 손님 인스타그램 계정 id를 암호화해 보관하며, 샵 직원도 볼 수 없습니다. 모두 위 90일 보관 기간을 따릅니다."
- (P22-6 추가) 처리방침 4항 Anthropic 줄 보충: "보내는 항목: 손님 상담 글(전화번호·이메일은 가림)과 샵 안내 정보. 보내지 않는 항목: 손님 카카오·인스타 계정 id, 연락처 원문. 샵별 하루 상한(300회)을 넘으면 보내지 않습니다."
- (P22-6 추가) 처리방침 4항 카카오·메타 줄 보충: "손님이 카카오톡 채널·인스타그램으로 보낸 글과 샵 답장은 해당 서비스를 거쳐 전달됩니다(각 서비스의 개인정보 처리방침이 함께 적용됩니다)." [수탁자 여부·국외 이전 고지 — 법률 검토 질문 21]
- (P22-6 추가) 샵용 고지 템플릿(`/shop/privacy-notice`)에 AI 상담을 켠 샵만 게시할 줄: "카카오톡·인스타그램 상담 글은 답변 작성을 위해 AI 서비스(Anthropic, 미국)로 전송되며 90일 뒤 삭제됩니다." [게시 방식은 P14-5와 같이 검토]
- 손님 첫 자동 답변 고지(샵이 바꿀 수 있음, 기본값): "안녕하세요! 이 답변은 AI가 샵 안내 정보로 드리는 자동 답변이에요. 예약·변경은 사장님이 직접 확인해 드려요."
- 채널이 실제로 연결되기 전(P22-3·4 시범 전)에는 `/privacy`를 바꾸지 않는다 — 없는 처리를 적지 않기 위해. 안내 정보 화면에는 "손님 글은 AI 서비스로 전송, 연락처는 가림 (초안 — 법률 검토 전)"을 표시했다.

## 사장님이 처리할 것 (외부 계정·설정)
1. **인스타 연결 방식**: 요청서는 Facebook 로그인. 메타에는 "Instagram 로그인" 방식(페이스북 페이지 연결 불필요, 같은 메시지 권한)도 있다. **추천: Instagram 로그인** — 렌탈샵 사장님이 페이스북 페이지를 따로 만들 필요가 없다. (확인 필요: Human Agent 태그가 이 방식에서도 같은지 4단계 착수 전에 확인)
2. **외부 계정(새 서비스 가입)**: 카카오 채널·오픈빌더 설정 순서는 [docs/kakao-setup.md](../kakao-setup.md), 메타 앱·심사 순서는 [docs/meta-setup.md](../meta-setup.md). 메타 개발자 앱 만들기·비즈니스 인증·앱 심사(Advanced Access, Human Agent) — 심사에 수 주가 걸릴 수 있어 일찍 시작해야 한다. 카카오는 샵마다 채널·챗봇 관리자센터 설정(무료). 제가 대신 가입하지 않는다.
3. **새 비밀값**(Vercel 환경변수, 사장님이 넣음): `CONSULT_ENCRYPTION_KEY`(32바이트), `CONSULT_HASH_KEY`, `META_APP_ID`·`META_APP_SECRET`·`META_VERIFY_TOKEN`. 값은 문서·대화에 쓰지 않는다.
4. **AI 원칙 예외**(위)와 **개인정보 처리방침 갱신·법률 검토**.
5. **문의 보존**: 90일 뒤 대화 삭제 때 "강습으로 넘긴 문의"를 남길지(연락처는 삭제).
6. 비용: 자동응답 1건당 호출 1회. 샵별 하루 상한(기본 200)을 상담에도 함께 쓸지, 상담 전용 상한을 둘지(추천: 상담 전용 300, 넘으면 escalate).
