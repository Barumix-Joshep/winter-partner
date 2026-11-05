# AI 상담 (P22) — 설계

렌탈샵이 카카오톡 채널·인스타그램 DM으로 받는 손님 상담을 AI가 돕는다. FAQ(가격·영업시간·위치·정책)는 AI가 바로 답하고, 예약·협상·불만처럼 판단이 필요한 문의는 사장님께 초안을 보여 주고 사장님이 처리한다.

상태: **설계 검토 대기** (2026-11-05). 사장님 승인 전에는 구현하지 않는다(CLAUDE.md 작업 방식).

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
| 인스타 장기 토큰 | 60일 유효·갱신(문서 재확인 필요 — 4단계 착수 전에 확인) | — |

## 아키텍처
```
카카오 스킬 요청 ─┐                              ┌─ auto: 채널 어댑터 send (카카오는 응답 본문/콜백, 인스타는 Send API)
인스타 웹훅 ──────┼→ 채널 어댑터 receive → 정규화 메시지 → 상담 엔진 ─┤
(상담톡: 껍데기) ─┘   (검증·중복 제거·저장)                         └─ escalate: inquiry·초안 저장 → 인박스(Realtime) → 사장님
```
- **채널 어댑터**(`src/lib/channels/<채널>/`): `receive(raw) → NormalizedMessage | null`(서명·토큰 검증, 스토리 답장·멘션·에코 제외), `send(conversation, text, opts)`, `canSend(conversation, now, opts) → {ok, tag?, reason}`. 공통 타입 `src/lib/channels/types.ts`. `KakaoCsTalkAdapter`는 세 함수가 "지원 안 함"을 돌려주는 껍데기.
- **상담 엔진**(`src/lib/ai/consult/`): 채널을 모른다. 입력 `{shopId, conversationId, text, channel}`, 출력 `{mode:'auto'|'escalate', reply, confidence, intent, draft?, extracted?}`. 순서: (1) 고정 규칙(빈 글·인젝션 문구·길이 초과 → unknown) (2) `callStructured` 1회(의도·신뢰도·답변·추출 JSON) (3) 판정 규칙(intent가 faq/smalltalk이고 신뢰도 ≥ 샵 임계값이고 답변에 쓴 금액이 모두 KB에 있을 때만 auto, 나머지는 escalate) (4) 채널별 길이로 자르기. AI가 꺼졌거나 상한·실패면 `escalate`(사람 처리)로 떨어진다 — 기존 원칙("꺼지면 수동 흐름")과 같다.
- **LLM 호출**: `client.ts`에 `consult` 기능 추가, 호출별 `timeoutMs`·`retries` 옵션을 더한다(카카오 경로는 3.5초·재시도 0, 넘으면 콜백 경로). 모델은 기존 설정 `private.app_settings`에 `ai_model_consult` 키를 더해 `ai_gate`가 고르게 하고(기본 `claude-haiku-5-5`, 지연이 짧은 모델), 프롬프트 버전은 상수 `CONSULT_PROMPT_VERSION`으로 두고, 메시지 행에 버전을 남긴다.
- **프롬프트 인젝션**: KB·샵 정보·규칙은 system, 손님 글은 항상 user 턴의 인용 블록. "지시 무시/시스템 프롬프트" 류는 규칙으로 먼저 unknown. 모델 출력은 스키마 검증 후에만 쓰고, 답변 속 금액은 KB 금액 집합과 대조해 하나라도 없으면 escalate.

## 데이터 모델 (모든 표 shop_id + RLS `private.is_shop_member(shop_id)`, 웹훅 쓰기는 security definer RPC)
- **shop_channels**: `channel`('kakao'|'instagram'|'kakao_cstalk'), `public_token`(웹훅 주소용 무작위값, 고유), `external_id`(카카오 봇 id / 인스타 계정 id), `credentials_enc`(bytea, 앱에서 AES-256-GCM 암호화), `webhook_secret_enc`, `enabled`, `auto_reply_enabled`(기본 false), `ai_disclosure_text`, `disclose_first_reply`(기본 true), `confidence_threshold`(기본 0.85), `token_expires_at`. 샵 관리자는 비밀 열을 읽지 못한다(열 권한 + 화면용 뷰).
- **shop_knowledge**: `kind`('price'|'hours'|'location'|'policy'|'faq'|'free_text'), `title`, `content`, `is_active`, `updated_at`. 샵 생성 시 기본 FAQ 템플릿(비활성 상태로 넣어 사장님이 채운 뒤 켬). 처음엔 임베딩 없이 활성 KB 전체를 프롬프트에(샵당 글자 수 상한).
- **conversations**: `channel`, `channel_id → shop_channels`, `external_user_hash`(HMAC-SHA256, 키는 서버 비밀), `display_name`, `status`('bot'|'waiting_owner'|'owner'|'closed'), `last_customer_message_at`, `summary`, `disclosed_at`(AI 고지 보낸 시각).
- **messages**: `conversation_id`, `shop_id`, `role`('customer'|'ai'|'owner'|'system'), `text`, `intent`, `confidence`, `prompt_version`, `channel_message_id`(채널별 고유 → **중복 제거·replay 방지**), `sent_at`, `delivery_status`('pending'|'sent'|'failed'|'skipped'), `tag`(인스타 HUMAN_AGENT 등).
- **inquiries 확장**(기존 표): `conversation_id`, `type`('lesson'|'rental'|'booking'|'complaint'|'other'), `extracted`(JSON: 날짜·인원·종목·레벨), `contact_enc`(연락처는 암호화, 화면 마스킹), `ai_draft`, `status`('open'|'replied'|'converted'|'closed'). 기존 `outcome`·`lost_reason`·`customer_id`는 그대로 둔다(손님 카드 연결용).
- **ai_feedback**: `message_id`, `shop_id`, `kind`('wrong'|'edited'), `corrected_text`, `created_by`, `created_at`.
- **보존**: 대화·메시지·피드백은 90일 뒤 매일 정리 작업(`api/maintenance/daily`)이 삭제. inquiry는 사장님이 "강습 등록"으로 넘긴 것만 연락처를 지운 뒤 남긴다(확인 필요: 사장님 결정).

## 화면
- `/shop/ai-consult/knowledge`: 종류별 KB 편집, 채널 연결 상태, AI 응대 켜기/끄기, 고지 문구, 임계값(고급).
- `/shop/ai-consult/inbox`: 대기 문의 목록(Realtime), 대화 상세(전체 메시지·AI 초안·추출 정보), 버튼 [수정] [승인·발송(인스타)] [복사(카카오)] [KB에 추가] [AI 답변 틀림], 자동응답 기록 탭. 카카오 대화에는 "무료 챗봇은 먼저 말을 걸 수 없어요 — 채널 1:1 채팅에서 답해 주세요" 표시. 모바일 우선.
- 본사 `/admin/ai`에 지표 카드(자동응답률·에스컬레이션률·평균 첫 응답시간·틀림 건수·샵별 LLM 비용).

## 채널 흐름
**카카오** `POST /api/webhooks/kakao/[token]`
1. token으로 shop_channels 찾기(없거나 꺼짐 → 기본 안내 응답). 봇 id 대조. `userRequest.user.id` 해시 → 대화 찾기/만들기. 발화 id(없으면 사용자+시각 해시)로 중복 제거.
2. 남은 시간 안(약 3.5초)에 엔진이 끝나면 바로 스킬 응답(simpleText ≤ 1000자, 실제 답은 500자 이내로 접힘 없게).
3. 넘기면 `useCallback:true` + 대기 문구로 응답하고, `after()`로 엔진을 끝낸 뒤 callbackUrl에 **한 번만** POST. 실패해도 재시도하지 않고 `delivery_status='failed'` + 인박스에 표시.
4. escalate면 "사장님께 전달했어요. 곧 1:1 채팅으로 답드릴게요." + 상담 연결(`operator`) 버튼.
5. 웹훅 인증: 카카오 스킬 요청에는 서명이 없다 → 추측할 수 없는 token 주소 + 봇 id 대조 + 샵별 요청 제한. (관리자센터에서 스킬 헤더 값을 지정할 수 있으면 비밀 헤더도 대조 — 1단계에서 확인)

**인스타** `GET/POST /api/webhooks/instagram`
1. GET: verify token 대조 → challenge. POST: 원문 바이트로 `X-Hub-Signature-256` HMAC 검증, 실패 400. 200을 먼저 돌려주고 처리는 `after()`.
2. `mid`로 중복 제거(36시간 재전송 대비). 에코(우리가 보낸 것)·스토리 답장·스토리 멘션·리액션은 자동응답 제외(저장만).
3. `canSend`: 마지막 손님 메시지 후 24시간 이내 → 자동 발송 가능. 24시간~7일 → **사장님이 인박스에서 승인 버튼을 누른 경우에만** `HUMAN_AGENT` 태그로 발송(자동 경로에서는 코드가 거부). 7일 초과 → 발송 불가. 첫 자동응답에는 고지 문구(기본 켬).
4. 연결: Instagram 로그인 OAuth로 샵 계정 연결(아래 결정 1), 토큰 암호화 저장, 매일 정리 작업이 만료 7일 전 갱신.

## 보안·개인정보
- 웹훅 검증(위), 샵별·대화별 요청 제한(기존 `public_rate_limit`), `channel_message_id` 고유 제약으로 replay 방지.
- 손님 id는 HMAC 해시만, 연락처는 AES-GCM 암호화 + 화면 마스킹(`010-****-1234`). 로그(`console`·`ops_events`)에는 메시지 원문을 쓰지 않는다(길이·의도만).
- AI에는 KB와 손님 글만 보내고, 글 속 전화번호·이메일은 `redact`로 가린다(추출은 규칙으로 서버에서). 샵별 하루 상한을 넘으면 자동응답을 멈추고 escalate.
- 웹훅 쓰기는 security definer RPC(서비스 키)로, 화면은 세션 클라이언트 + RLS.

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

## 사장님이 결정·처리할 것
1. **인스타 연결 방식**: 요청서는 Facebook 로그인. 메타에는 "Instagram 로그인" 방식(페이스북 페이지 연결 불필요, 같은 메시지 권한)도 있다. **추천: Instagram 로그인** — 렌탈샵 사장님이 페이스북 페이지를 따로 만들 필요가 없다. (확인 필요: Human Agent 태그가 이 방식에서도 같은지 4단계 착수 전에 확인)
2. **외부 계정(새 서비스 가입)**: 메타 개발자 앱 만들기·비즈니스 인증·앱 심사(Advanced Access, Human Agent) — 심사에 수 주가 걸릴 수 있어 일찍 시작해야 한다. 카카오는 샵마다 채널·챗봇 관리자센터 설정(무료). 제가 대신 가입하지 않는다.
3. **새 비밀값**(Vercel 환경변수, 사장님이 넣음): `CONSULT_ENCRYPTION_KEY`(32바이트), `CONSULT_HASH_KEY`, `META_APP_ID`·`META_APP_SECRET`·`META_VERIFY_TOKEN`. 값은 문서·대화에 쓰지 않는다.
4. **AI 원칙 예외**(위)와 **개인정보 처리방침 갱신·법률 검토**.
5. **문의 보존**: 90일 뒤 대화 삭제 때 "강습으로 넘긴 문의"를 남길지(연락처는 삭제).
6. 비용: 자동응답 1건당 호출 1회. 샵별 하루 상한(기본 200)을 상담에도 함께 쓸지, 상담 전용 상한을 둘지(추천: 상담 전용 300, 넘으면 escalate).
