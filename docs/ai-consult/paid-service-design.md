# AI 상담 유료 서비스 분리 — 설계 (P23)

AI 상담(P22) 전체를 별도 유료 서비스로 나눈다. 본사가 샵별로 **"AI 상담 사용권"** 을 줘야 샵이 AI 상담을 켤 수 있다. 사용권이 없거나 끝나면 상담 기능 전체가 꺼진 상태로 동작한다. 청구는 앱 밖에서 수동으로 하고(결제 연동 없음), 앱은 **사용권과 사용량만** 관리한다.

상태: **설계 초안 (P23-1, 2026-11-06)**. 이번 작업은 문서만이다. 코드·마이그레이션은 P23-2부터.

- 관련 문서: P22 설계 [README.md](README.md), 요청 제한 [docs/rate-limits.md](../rate-limits.md), 법률 검토 의뢰서 [docs/legal-review-packet.md](../legal-review-packet.md) 4절(이번에 추가), 원격 적용 절차 [docs/pending-migrations.md](../pending-migrations.md).
- 가격은 **임시안**이다(아래 2-2). 값은 코드에 두지 않고 요금제 표에 둔다.

## 사장님 결정 (2026-11-06, 이 문서에 반영)
| 항목 | 결정 |
|---|---|
| 무료 체험 | **10일**. 기본 시작 기준은 "샵이 AI 상담을 켠 뒤 **첫 자동응답이 나간 시점**". 본사가 부여할 때 시작일을 직접 지정하는 옵션도 둔다 |
| 체험 종료 | 자동 유료 전환 **없음**. 사용권이 "중지"가 된다. 연장·유료 전환은 본사 관리자가 수동으로 |
| 만료 알림 | 만료 **3일 전** 샵에 알림 |
| 가격(임시안) | 월 59,000원(부가세 별도), 월 응답 2,000건 포함, 초과 시 자동응답 중지 후 사장님에게 넘김, 추가 1,000건 팩 19,000원 |
| 값 보관 | 코드에 박지 않고 요금제 설정 값(표)으로. 바꾸기 쉽게 |
| 약관 | 법률 검토 의뢰서에 유료 조항 초안을 별도 절로(P13-7·P14-5 묶음). P23-4는 법률 검토로 blocked |

---

## 1. 현재 구조 조사

### 1-1. 한눈에 보기
| 기능 | 화면·라우트 | 앱 코드 | DB(마이그레이션) | 강제 위치 |
|---|---|---|---|---|
| 상담 설정 켜기·끄기 | `/shop/ai-consult/knowledge` "AI 자동 응대" 버튼 | `src/app/shop/ai-consult/knowledge/actions.ts` `setAutoReply`·`saveDisclosure` | 표 `shop_consult_settings`(샵당 1행, `auto_reply_enabled` 기본 false), RPC `public.set_consult_settings(p_shop_id, p_auto_reply, p_disclosure, p_disclose_first)` — 샵 멤버 확인, 켜기·끄기는 `audit_events`에 `consult_auto_reply_on/off` (`20261105114656_consult_schema.sql`) | **DB**: 표 쓰기 권한 회수, RPC만. 샵 멤버면 누구나 켠다(사용권 확인 없음) |
| 엔진의 자동응답 판정 | — | `src/lib/ai/consult/engine.ts` `loadConsultContext`(서비스 키로 `auto_reply_enabled`·임계값 읽기), `runConsult` 판정 마지막 단계 `auto_off` | — | **앱**. 꺼져 있어도 AI는 부른다(사장님 초안을 만들기 위해) |
| AI 호출 문 | — | `src/lib/ai/client.ts` `callStructured` → `defaultDeps.gate` → RPC `ai_gate`, 호출마다 `record_ai_usage` | `public.ai_gate(p_shop_id, p_feature)`: 플랫폼 기본값(`app_settings.ai_features`) → 샵 설정(`shops.ai_features`) → 상담은 `private.consult_quota_ok`(하루 300) → 플랫폼 월 비용 상한(`ai_monthly_cap_krw`). 사용량 표 `ai_usage`(`20261102000700_ai_usage.sql`, 상담 분기는 `20261105114656`) | **DB**(service_role만 호출). 키가 없으면 앱이 아예 안 부름 |
| 하루 상한 300 | — | 엔진은 `ai_gate`가 막으면 `callStructured`가 null → `escalate("ai_unavailable")` | `private.consult_quota_ok(shop)`: `ai_usage`에서 feature `consult`, 한국 날짜 오늘 건수 < `setting_int('ai_consult_daily_calls_per_shop')`(300). 다른 AI 기능 `private.ai_quota_ok`는 consult를 빼고 200 | **DB**. 재시도·실패 호출도 1건씩 센다(`ai_usage` 행 단위) |
| 카카오 웹훅 | `POST /api/webhooks/kakao/[token]` (`src/app/api/webhooks/kakao/[token]/route.ts`) | `src/lib/channels/kakao/webhook.ts` `kakaoRoute`·`handleKakaoSkill`, 의존성 `kakao/deps.ts` `kakaoDeps`, 저장 `src/lib/channels/store.ts` `consultStore` | `consult_record_customer_message`·`consult_record_reply`·`consult_open_inquiry`(service_role 전용) | 채널 확인(`shop_channels.enabled`, 봇 id)은 **앱**. 저장 RPC는 DB |
| 인스타 웹훅 | `GET/POST /api/webhooks/instagram` | `src/lib/channels/instagram/webhook.ts`(대화 한도면 `RATE_LIMITED`로 엔진을 건너뜀), `instagram/deps.ts`, 연결 `GET /api/channels/instagram/connect`·`/callback` (`connect.ts`, `oauth.ts`) | 위 RPC + `consult_connect_instagram`(서버 전용)·`consult_disconnect_channel`(샵 멤버) (`20261105133519_consult_instagram.sql`) | 앱 + DB 저장 |
| 사장님 인박스 | `/shop/ai-consult/inbox`, `/shop/ai-consult/inbox/[id]`, 샵 메뉴 "AI 상담" 대기 수(`src/components/area-shell.tsx`) | `inbox/page.tsx`·`[id]/page.tsx`·`reply-panel.tsx`·`live.tsx`(10초 `inboxPulse`)·`actions.ts`, 도움 `src/lib/channels/inbox.ts`, 인스타 승인 발송 `src/lib/channels/owner-reply.ts` | `consult_owner_reply`·`consult_close_conversation`(`20261105141851_consult_inbox.sql`), `consult_convert_inquiry`(`20261105145008_consult_retention.sql`), `ai_feedback` RLS `member_insert` | 읽기는 RLS `is_shop_member`(**DB**), 버튼은 RPC(**DB**) |
| 안내 정보(지식) 입력 | `/shop/ai-consult/knowledge` | `knowledge/actions.ts` `saveKnowledge`·`deleteKnowledge`, 검증 `src/lib/ai/consult/knowledge.ts`(활성 합계 8,000자 `KB_ACTIVE_TOTAL_MAX`) | 표 `shop_knowledge` RLS `member_all`, 새 샵 기본 템플릿 트리거 `shop_consult_defaults`(비활성 8개) | **DB**(RLS). 글자 수 상한은 앱 |
| 본사 지표 카드 | `/admin/ai` (`src/app/admin/ai/page.tsx` → `consult-metrics.tsx` `ConsultMetrics`, `?month=YYYY-MM`) | 집계·표시 `src/lib/ai/consult/metrics.ts`(`kstMonthRange`·`summarize`·`capUse`) | `consult_admin_metrics(p_from, p_to)`(전체 합계), `consult_admin_shop_costs(p_from, p_to)`(샵별 호출·실패·비용·하루 최대·상한 닿은 날) — 본사만, 숫자·uuid만 (`20261105151914_consult_admin_metrics.sql`) | **DB**(본사 확인, 기간 1~400일) |
| 90일 정리 | 매일 정리 `GET /api/maintenance/daily`(Vercel Cron 18:00 UTC = 03:00 KST) | `src/app/api/maintenance/daily/route.ts` | `public.purge_consult_data()`(service_role만) | **DB** |
| 알림 | 앱 알림 목록 `/notifications`, 웹푸시 발송 `GET /api/notify/dispatch`(Cron 00:00 UTC = 09:00 KST) | `src/lib/notify/dispatch.ts`, 문구 `src/lib/notify/messages.ts`(`ai_cap_reached` 등) | 표 `notifications`(`0001_init.sql`), `ai_gate`가 월 상한 첫 도달 때 본사에 `ai_cap_reached`를 넣는 방식 | DB에 쌓고 앱이 보냄. 알림톡은 아직 없음 |
| 설정 값 | — | — | `private.app_settings`(RLS 켬, API 역할·service_role 모두 읽기·쓰기 불가 — `20261102000150_app_settings_rls.sql`). 값 변경은 DB 관리자가 SQL Editor에서 | **DB** |
| 감사 기록 | — | — | `public.audit_events`(고치기·지우기 금지 트리거), 쓰기는 `private.audit(shop, action, table, target, detail)`. 읽기는 그 샵 멤버와 본사 (`20261105052447_audit_events.sql`) | **DB** |

### 1-2. 메시지 한 건이 지나는 길 (현재)
1. 웹훅이 채널을 찾는다. 카카오는 토큰·`enabled`·봇 id가 맞지 않으면 기본 안내(`guidanceResponse`), 인스타는 서명이 틀리면 400.
2. 샵 요청 제한 `consult_shop`(10분 300) → 넘으면 저장 없이 끝(카카오는 `busyResponse`).
3. 손님 메시지 저장(`consult_record_customer_message`, 연락처는 가린 글만).
4. 대화 요청 제한 `consult_conversation`(10분 20) → 넘으면 **AI 없이** 문의를 열고 사장님께 넘김(카카오 `busyResponse`, 인스타 `RATE_LIMITED` → "사장님께 전달했어요" 한 번).
5. 엔진 `runConsult` → `callStructured` → `ai_gate`. 여기서 하루 300·월 비용 상한·기능 꺼짐이면 AI를 부르지 않고 `ai_unavailable`로 escalate.
6. auto면 손님에게 답(`consult_record_reply`, role `ai`, `sent`), escalate면 상담 연결 안내 + `consult_open_inquiry`(AI 초안 포함).

### 1-3. 조사에서 나온 사실 (설계에 영향)
- **자동응답을 꺼도 AI 비용이 든다.** 엔진은 `auto_off`를 마지막에 판정하므로, 꺼진 샵도 손님 메시지마다 AI를 한 번 불러 사장님 초안을 만든다. 사용권이 없을 때는 이 초안 호출도 막아야 한다.
- **DB 한 곳(`ai_gate`)만 고쳐도 "AI 없이 사장님께 넘김"이 된다.** 게이트가 막으면 엔진이 이미 escalate하고 웹훅이 문의를 연다. 앱 변경은 이유 표시·화면 안내를 위한 것이다.
- **`set_consult_settings`는 사용권을 모른다.** 지금은 샵 멤버면 누구나 켤 수 있다. 여기도 DB에서 막는다.
- **카카오 채널 `enabled`는 본사가 켠다**(연결 RPC 없음, `docs/kakao-setup.md` 3·문제 해결 표). 인스타는 샵이 OAuth로 직접 연결한다.
- **`ai_usage`는 호출 시도 단위다.** 인스타는 실패 뒤 1회 재시도하므로 손님 메시지 1건에 행이 2개 생길 수 있다(`ok=false` 1 + `ok=true` 1). "응답 1건"을 셀 때 이 차이를 정해야 한다(9절 Q1).
- **샵은 자기 `ai_usage`를 이미 읽을 수 있다**(RLS `member_read`). 사용량 화면에 새 권한이 필요 없다.
- **`app_settings`는 API로 못 고친다.** 본사 화면에서 가격을 바꾸려면 새 표 + 본사 전용 RPC가 필요하다 → 요금제는 표로 둔다(2-2).
- **플랫폼 월 비용 상한(`ai_monthly_cap_krw` 80,000원)은 모든 AI 기능이 함께 쓴다.** 유료 샵이 늘면 이 상한이 유료 샵 응답을 막을 수 있다. 1건당 비용이 낮아 당장은 문제가 아니지만(아래 4-3 추정) 샵 수가 늘면 다시 본다(9절 Q12).

---

## 2. 사용권 데이터 모델 제안

### 2-1. 표 세 개
모든 쓰기는 본사 전용 security definer RPC로만 한다. 로그인 사용자의 insert·update·delete 권한은 회수한다(기존 상담 표와 같은 방식).

**`consult_plans` — 요금제 (임시안 값을 여기에 둔다)**
| 열 | 형 | 설명 |
|---|---|---|
| `id` | uuid pk | |
| `code` | text unique | 예: `standard_v1` (가격이 바뀌면 새 행, 옛 행은 `active=false`) |
| `name` | text | 화면 이름. 예: "AI 상담 기본" |
| `monthly_price_krw` | int | 59000 (임시안). 표시·청구 참고용. 앱이 돈을 받지 않는다 |
| `vat_included` | boolean | false (부가세 별도) |
| `included_monthly_responses` | int | 2000 (임시안) |
| `overage_policy` | text check (`block`, `allow`) | `block` = 초과 시 AI 중지·사장님께 넘김(임시안). `allow` = 초과 허용(나중에 청구) |
| `pack_size` · `pack_price_krw` | int · int | 1000 · 19000 (임시안) |
| `trial_days` | int | 10 |
| `expiry_notice_days` | int | 3 |
| `active` | boolean | 새 부여에 쓸 수 있는지 |
| `created_at` · `created_by` | | |

- 임시안 행 하나를 마이그레이션이 넣는다(`standard_v1`, 위 값). 가격을 바꿀 때는 본사 화면(5절)에서 **새 행**을 만들고 옛 행을 끈다. 이미 부여한 사용권은 부여 때의 값(아래 스냅숏)을 그대로 쓴다 → "가격 변경 통지" 전에 기존 샵 조건이 몰래 바뀌지 않는다.
- `app_settings`를 쓰지 않는 이유: API 역할이 못 고쳐서 본사 화면에서 바꿀 수 없고, 값 변경 이력이 남지 않는다(1-3).

**`consult_licenses` — 샵별 사용권 (샵당 1행)**
| 열 | 형 | 설명 |
|---|---|---|
| `shop_id` | uuid pk → shops (on delete cascade) | 샵당 하나. 이력은 `audit_events` |
| `plan_id` | uuid → consult_plans | |
| `status` | text check (`trial`, `paid`, `suspended`) | 체험 / 유료 / 중지 |
| `start_mode` | text check (`first_auto_reply`, `fixed`) | 체험 시작 기준. 기본 `first_auto_reply` |
| `starts_at` | timestamptz null | null = 체험 대기(첫 자동응답 전). `fixed`면 부여 때 넣음 |
| `ends_at` | timestamptz null | 체험은 시작 때 계산(9절 Q2). 유료는 "청구가 끝난 날까지"(본사가 넣음) |
| `included_monthly_responses` | int | 부여·변경 때 요금제에서 복사(스냅숏). 본사가 샵별로 고칠 수 있음 |
| `overage_policy` | text | 스냅숏 |
| `daily_cap` | int null | null이면 `ai_consult_daily_calls_per_shop`(300). 큰 샵만 올릴 때 |
| `suspended_reason` | text null check (`trial_ended`, `expired`, `admin`, `unpaid`, `terminated`) | 중지 이유 |
| `granted_by` · `granted_at` | uuid · timestamptz | 처음 부여한 본사 관리자 |
| `updated_by` · `updated_at` | | 마지막으로 바꾼 본사 관리자 |
| `admin_note` | text null (500자) | 본사 메모(청구 메모 등). **샵은 못 읽는다**(열 권한) |
| `notice_sent_for` | timestamptz null | 만료 알림을 보낸 `ends_at` 값(같은 만료일에 한 번만) |

**`consult_usage_packs` — 추가 팩**
| 열 | 형 | 설명 |
|---|---|---|
| `id` | uuid pk | |
| `shop_id` | uuid → shops | |
| `month` | text (`YYYY-MM`, 한국 시간 달) | 이 달에만 쓴다(9절 Q6) |
| `responses` | int | 1000 × 팩 수 |
| `price_krw` | int | 부여 때 요금제에서 복사(청구 참고) |
| `granted_by` · `created_at` | | |

### 2-2. 임시안 값 (요금제 `standard_v1`)
| 값 | 임시안 | 바꾸는 곳 |
|---|---|---|
| 월 요금 | 59,000원, 부가세 별도 | 본사 화면 "요금제" → 새 행 |
| 포함 응답 | 월 2,000건 | 같음 (샵별 조정은 사용권 화면) |
| 초과 정책 | 자동응답 중지 → 사장님께 넘김(`block`) | 같음 |
| 추가 팩 | 1,000건 19,000원 | 같음 |
| 체험 | 10일 | 같음 |
| 만료 알림 | 3일 전 | 같음 |

코드에는 이 숫자를 쓰지 않는다. 화면 문구도 표에서 읽어 넣는다.

### 2-3. "켜져 있다"의 정의 (DB 함수 하나로)
`private.consult_license_ok(p_shop uuid, p_at timestamptz default now()) returns text` — `'ok'` 또는 막는 이유를 돌려준다.

| 상태 | 조건 | 결과 |
|---|---|---|
| 행 없음 | | `no_license` |
| `suspended` | | `suspended` |
| `trial`, `starts_at` null | 체험 대기 | `ok` (AI 초안·첫 자동응답 가능. 첫 자동응답이 나가면 시계가 돈다) |
| `trial`·`paid`, `starts_at > now()` | 지정일 전 | `not_started` |
| `trial`·`paid`, `ends_at <= now()` | 끝남(정리 작업 전이라도) | `expired` |
| 그 밖 | | `ok` |

- 끝나는 시각은 **호출 때마다** 비교한다. 매일 정리 작업이 상태를 `suspended`로 바꾸기 전에도 바로 막힌다.
- 모든 판정(`ai_gate`, `set_consult_settings`, 웹훅 앱 확인, 화면 표시)이 이 함수 하나를 쓴다.

### 2-4. 체험 시계 시작 (DB 트리거)
- `messages`에 `after insert or update of delivery_status` 트리거: `role = 'ai' and delivery_status = 'sent'`이고 그 샵 사용권이 `trial`·`start_mode = first_auto_reply`·`starts_at is null`이면 `starts_at = now()`, `ends_at = 시작 + 10일`(9절 Q2 규칙), `audit_events`에 `consult_trial_started`.
- 트리거로 두는 이유: 카카오 즉답·콜백, 인스타 자동 발송이 모두 `consult_record_reply`로 같은 표에 남는다. 앱 경로를 하나 빠뜨려도 시계는 돈다.
- `fixed`는 부여 때 `starts_at`·`ends_at`을 바로 넣는다.

### 2-5. 변경 이력 — `audit_events`를 쓴다
- 새 이력 표를 만들지 않는다. 모든 RPC가 `private.audit(shop_id, action, 'consult_licenses', shop_id, detail)`을 남긴다.
- action: `consult_license_granted`, `consult_license_extended`, `consult_license_paid`, `consult_license_suspended`, `consult_license_resumed`, `consult_license_quota_changed`, `consult_pack_added`, `consult_trial_started`, `consult_plan_created`(shop_id null).
- detail: 바뀌기 전·뒤 상태·날짜·포함량·요금제 code. **`admin_note`는 넣지 않는다** — `audit_events`는 그 샵 멤버도 읽기 때문이다.
- 장점: 고칠 수 없는 기록, 본사·샵 모두 같은 이력을 본다, 기존 감사 화면·점검과 같은 곳. 단점: 사용권 상태를 시점별로 되돌려 보려면 detail을 따라가야 한다(드문 일).
- 시스템이 바꾼 것(정리 작업의 중지, 체험 시작)은 `actor_id`가 null이다.

### 2-6. RLS·권한
| 표 | 샵 멤버 | 본사 | 쓰기 |
|---|---|---|---|
| `consult_licenses` | 자기 샵 행 **읽기만**(`private.is_shop_member(shop_id)`), `admin_note` 열 제외(열 권한) | 전체 읽기(`private.is_platform_admin()`) | 본사 RPC만. insert·update·delete 권한 회수 |
| `consult_usage_packs` | 자기 샵 읽기 | 전체 읽기 | 본사 RPC만 |
| `consult_plans` | 자기 사용권의 요금제만 읽기(가격 표시용) | 전체 읽기 | 본사 RPC만 |
| (기존) `ai_usage` | 자기 샵 읽기(이미 있음) | 전체 읽기(이미 있음) | `record_ai_usage`(service_role) |

강사·다른 샵·anon은 0건. pgTAP로 확인한다(8절).

---

## 3. 차단 지점 목록

원칙: **DB에서 막아 우회할 수 없게 하고, 앱은 같은 판정을 미리 읽어 화면 안내와 이유 기록만 한다.** 앱 확인이 실패하거나 빠져도 DB가 막는다.

### 3-1. DB에서 막는 곳
| 지점 | 바꿀 것 | 사용권이 없을 때 |
|---|---|---|
| `public.ai_gate` (feature `consult`) | 기능 꺼짐 확인 다음, 하루 상한 앞에 `consult_license_ok` → 아니면 `(false, 'no_license')`. 이어서 월 포함량 확인 → 넘으면 `(false, 'monthly_quota')`(정책 `block`일 때) | AI 호출 0, `ai_usage` 기록 0. 엔진은 escalate |
| `public.set_consult_settings` | `p_auto_reply = true`이고 `consult_license_ok <> 'ok'`이면 `42501` "AI 상담 사용권이 없어 켤 수 없습니다". 끄기·고지 문구 저장은 그대로 허용 | 켜기 거부 |
| `private.consult_quota_ok` | 사용권의 `daily_cap`이 있으면 그 값, 없으면 300 | 하루 상한은 남김(남용 방지) |
| 매일 정리 작업 새 함수 `public.consult_license_sweep()`(service_role만) | 끝난 사용권 → `suspended`(`trial_ended`/`expired`), `auto_reply_enabled = false`(감사 기록), 만료 3일 전 알림 | 상태 정리. 판정은 이미 2-3에서 바로 막힘 |

- **켜짐 스위치**: 원격 적용 순서를 안전하게 하려고 `app_settings`에 `consult_license_required`(기본 `false`)를 둔다. false면 `ai_gate`·`set_consult_settings`가 사용권을 보지 않는다(지금 동작 그대로). 코드 병합·시범 샵 사용권 부여까지 끝난 뒤 사장님이 SQL Editor에서 true로 바꾼다(8절). 되돌리기도 이 값 하나.
- 사용권 중지 때 `auto_reply_enabled`를 끄는 이유: 연장 뒤 자동응답이 저절로 다시 켜지지 않게, 사장님이 다시 켜는 것을 확인하도록. (9절 Q9)

### 3-2. 경로별 동작
| 경로 | 사용권 있음(`ok`) | 없음·중지·만료·시작 전 | 포함량 초과(`block`) |
|---|---|---|---|
| **카카오 웹훅** | 지금과 같음 | 채널·봇 확인 → 샵 요청 제한 → 메시지 저장(가린 글) → **엔진을 부르지 않고** 문의 열기(초안 없음) → `escalateResponse()`("사장님께 전달했어요" + 상담 연결 버튼). 로그 `license_off` | 같은 흐름, 로그 `monthly_quota` |
| **인스타 웹훅** | 지금과 같음 | 저장 → 엔진 대신 `NO_LICENSE` 결과(대화 한도의 `RATE_LIMITED`와 같은 자리) → 열린 문의가 없을 때만 "사장님께 전달했어요" 한 번 → 문의 열기 | 같음 |
| **엔진(`runConsult`)** | 지금과 같음 | 웹훅이 부르지 않는다. 누가 불러도 `ai_gate`가 막아 `ai_unavailable` escalate. 이유를 구분하려고 게이트 이유 `no_license`·`monthly_quota`를 엔진 `reason`으로 넘긴다(지표용) | 같음 |
| **설정 켜기**(`/shop/ai-consult/knowledge`) | 지금과 같음 | 켜기 버튼 대신 "AI 상담 사용권이 필요해요" 안내와 본사 문의 방법. 눌러도 DB가 거부. 끄기는 항상 가능 | 켜기는 되지만 "이번 달 포함 응답을 다 썼어요" 표시 |
| **안내 정보 입력** | 지금과 같음 | **편집 허용**. 체험 전에 미리 채워 두게 한다(원래 설계: "채널 연결 전에도 준비"). 사람이 쓰는 샵 자료라 AI 비용이 없다. 상단에 "사용권이 생기면 AI가 이 정보로 답합니다" | 같음 |
| **인박스**(`/shop/ai-consult/inbox`) | 지금과 같음 | **읽기·사장님 답장·복사·닫기·강습 등록 허용**. 손님 메시지가 사장님께 넘어오는 곳이라 막으면 손님 문의가 사라진다. 상단 띠 "AI 자동응답이 꺼져 있어요 — 모든 문의를 직접 답해 주세요". [AI 답변 틀림]은 기존 AI 메시지에만 남음. 새 AI 초안은 없음 | 같음, 띠 문구만 "이번 달 포함 응답 소진" |
| **인스타 연결**(`/api/channels/instagram/connect`) | 지금과 같음 | **새 연결은 사용권이 있을 때만**(앱 확인 + 연결 RPC `consult_connect_instagram`에서 DB 확인). 이미 연결된 채널은 그대로 두고 사장님께 넘김 | 허용 |
| **카카오 채널 켜기**(본사) | | 본사가 사용권 없는 샵의 채널을 켜지 않는다(5절 화면에서 같이 보여 줌) | |
| **본사 지표 카드** | 지금과 같음 | 그대로(숫자만). 새 이유 `no_license`·`monthly_quota` 건수를 따로 셀 수 있다 | |
| **90일 정리** | | **바꾸지 않는다**. 꺼진 샵의 대화·문의도 같은 규칙(90일 뒤 삭제, 강습 등록 문의만 연락처 지워 보존) | |

- 기존 대화·문의 기록은 사용권과 상관없이 90일 보존 규칙을 그대로 따른다. 사용권이 끝났다고 바로 지우지 않는다.
- 하루 상한 300은 사용권과 별개로 남는다(같은 날 도배 방지). 월 포함량은 청구 단위다(9절 Q5).

---

## 4. 사용량 계측

### 4-1. 셀 것과 어디서 세나
| 값 | 정의 | 출처 |
|---|---|---|
| **응답 건수(청구 단위, 추천)** | AI가 처리한 손님 메시지 수 = 그 달 `ai_usage` feature `consult`, `ok = true` 행 수 | `ai_usage` (재시도의 실패 행은 빼고, 성공은 메시지당 1행) |
| 자동응답 수(참고) | 손님에게 실제로 나간 AI 답 = `messages` role `ai`, `delivery_status = 'sent'` | `messages` (90일 뒤 지워짐 → 월 마감 때 숫자로 남겨야 함, 아래) |
| 호출·실패·비용 | `ai_usage` 전체 행·`ok = false`·`sum(cost_krw)` | `ai_usage` |
| 이번 달 한도 | 사용권 `included_monthly_responses` + 그 달 팩 합계 | `consult_licenses` + `consult_usage_packs` |
| 비율 | 응답 건수 ÷ 이번 달 한도 | 위 둘 |

- 달은 **한국 시간 달력 달**이다(정산·지표 카드와 같음, `kstMonthRange`).
- `ai_gate`의 월 포함량 확인은 `ai_usage`의 이번 달 consult `ok` 건수를 센다. 색인 `ai_usage (shop_id, created_at desc)`가 이미 있어 샵·이번 달 범위 조회가 가볍다.
- 월 마감 숫자: `messages`는 90일 뒤 지워지고 `ai_usage`는 남는다. 청구 근거는 `ai_usage` 기준으로 두면 따로 남길 표가 필요 없다. 자동응답 수까지 남기려면 P23-3에서 월별 요약 표(숫자만)를 검토한다.

### 4-2. 화면에 보이는 법
- **본사**(5절): 샵별 "이번 달 응답 1,240 / 2,000 (62%)", 팩 포함 한도, 자동응답 수, 비용(원), 1건당 비용, 하루 최대 / 상한. 기존 `consult_admin_shop_costs`를 고치지 않고(반환 형이 바뀌면 drop이 필요) 새 함수 `consult_admin_license_overview(p_month text)`를 둔다 — 본사만, 숫자·uuid·날짜만.
- **샵**: 안내 정보 화면 위쪽에 "이번 달 AI 응답 1,240 / 2,000건", 남은 체험 일수 또는 다음 종료일. 샵은 자기 `ai_usage`를 읽을 수 있어(RLS) 세션 클라이언트로 센다. 같은 정의를 쓰도록 DB 함수 `consult_my_usage(p_shop_id)`(샵 멤버 확인)로 묶는 것을 추천.
- 80% 도달 알림은 9절 Q8.

### 4-3. 초과 시 동작 후보
| 후보 | 동작 | 장점 | 단점 |
|---|---|---|---|
| **A. 차단** | AI 호출도, 손님 답도 없음(웹훅이 아무 말 안 함) | 비용 0 | 손님이 답을 못 받는다. 카카오는 응답이 꼭 있어야 해서 불가능. **쓰지 않는다** |
| **B. 에스컬레이션 (임시안)** | AI를 부르지 않고 사장님께 넘김. 손님에게는 "사장님께 전달했어요" + 상담 연결. 사장님 초안도 없음 | 비용이 한도에서 멈춤. 손님 문의는 사라지지 않음. 지금 하루 상한 300과 같은 동작이라 새 경로가 적다 | 성수기 주말에 갑자기 자동응답이 멈춘다 → 80% 알림·팩 추가가 필요 |
| **C. 초과 허용** | 계속 AI가 답하고, 넘은 건수를 다음 청구에 더함 | 손님 경험 끊김 없음 | 앱 밖 청구에 "넘은 건수" 정산이 필요. 샵이 예상 못 한 청구를 받음(약관·통지 부담). 하루 300은 여전히 막음 |
| B와 C 사이 | 초과 뒤 **초안만**(AI는 부르되 자동응답은 끔) | 사장님 일은 줄어든다 | 비용이 계속 든다. "응답 건수" 정의가 복잡해진다 |

**추천: B(임시안 그대로)** + 80% 알림 + 본사가 팩을 바로 추가할 수 있는 화면. 요금제 `overage_policy`로 나중에 C로 바꿀 수 있게 둔다.

### 4-4. 1건당 비용 추정 (참고, 실제 값은 4-5로 잰다)
- 단가(`ai_prices_krw_per_mtok`, 2026-11-02): Haiku 5.5 입력 145원·출력 725원 / 100만 토큰. 상담 모델 `ai_model_consult` = `claude-haiku-5-5`.
- 상담 1회: 입력 = 시스템 지시 + 켜 둔 안내 정보(최대 8,000자) + 손님 글. 대략 2,000~8,000토큰 → 0.3~1.2원. 출력 최대 600토큰 → 최대 0.4원. **합계 약 0.3~1.6원/건(추정)**.
- 2,000건이면 월 약 600~3,200원(추정). 임시안 포함분 단가 29.5원/건과 차이가 크다. 실제 값은 시범 첫 주에 잰다.

### 4-5. 시범 첫 주에 샵별 실제 비용 뽑는 법
**방법 1 — 본사 화면 (가장 쉬움)**
1. 본사 계정으로 `/admin/ai`를 연다. 아래 "AI 상담 지표" 카드에서 기간을 시범 달로 고르고 [보기].
2. "샵별 AI 상담 비용" 표에서 샵의 **호출(실패)**·**비용**을 적는다. 카드 위 "자동응답률"의 분자(자동응답 수)는 **전체 샵 합계**다.
3. 한계: 카드는 **달 단위**이고, 샵별 **자동응답 수는 없다**. 시범 샵이 한 곳이면 카드 숫자로 계산할 수 있고, 여러 곳이면 방법 2를 쓴다.

**방법 2 — Supabase SQL Editor (읽기만, 사장님이 실행)**
- Supabase 대시보드 → SQL Editor에서 아래를 붙여 넣고 첫 줄 두 날짜만 바꿔 실행한다. 읽기만 한다(데이터를 바꾸지 않는다). 결과에는 샵 이름과 숫자만 나온다(손님 글·연락처 없음).
- 로컬 DB에서 문법과 계산을 확인했다(가짜 사용량 70행을 넣은 트랜잭션에서 돌리고 되돌림).

```sql
-- 시범 기간(한국 시간): 시작·끝 날짜만 바꾼다. 끝 날짜는 그날 0시라 그날은 빠진다
with p as (
  select timestamptz '2026-11-24 00:00:00+09' as f,
         timestamptz '2026-12-01 00:00:00+09' as t
),
u as (  -- AI 상담 호출(재시도·실패 포함)과 비용
  select x.shop_id,
         count(*)                     as calls,
         count(*) filter (where x.ok) as ok_calls,
         sum(x.cost_krw)              as cost_krw
  from public.ai_usage x, p
  where x.feature = 'consult' and x.shop_id is not null
    and x.created_at >= p.f and x.created_at < p.t
  group by x.shop_id
),
a as (  -- 손님에게 실제로 나간 AI 자동응답
  select m.shop_id, count(*) as auto_replies
  from public.messages m, p
  where m.role = 'ai' and m.delivery_status = 'sent'
    and m.sent_at >= p.f and m.sent_at < p.t
  group by m.shop_id
)
select s.name                                                                         as 샵,
       u.calls                                                                        as 호출,
       u.ok_calls                                                                     as 성공_호출,
       coalesce(a.auto_replies, 0)                                                    as 자동응답,
       round(u.cost_krw, 1)                                                           as 비용_원,
       round(u.cost_krw / nullif(a.auto_replies, 0), 2)                               as 자동응답_1건당_원,
       round(u.cost_krw / nullif(u.ok_calls, 0), 2)                                   as 성공_호출_1건당_원,
       round(u.cost_krw * 30 / (extract(epoch from p.t - p.f) / 86400), 0)            as 월_환산_비용_원,
       round(coalesce(a.auto_replies, 0) * 30 / (extract(epoch from p.t - p.f) / 86400)) as 월_환산_자동응답,
       round(u.ok_calls * 30 / (extract(epoch from p.t - p.f) / 86400))               as 월_환산_성공_호출
from u
join public.shops s on s.id = u.shop_id
cross join p
left join a on a.shop_id = u.shop_id
order by 비용_원 desc;
```

**읽는 법**
- **자동응답 1건당 평균 비용** = 비용 ÷ 자동응답. 사장님께 넘긴 초안 호출 비용까지 자동응답에 얹은 값이다("자동응답 하나를 내보내는 데 실제로 든 돈").
- **성공 호출 1건당** = 비용 ÷ 성공 호출. 청구 단위(추천 정의, 4-1)의 원가다.
- **월 환산** = 기간 값 × 30 ÷ 기간 일수. 첫 주는 손님이 적을 수 있어 성수기 값은 따로 본다.
- `cost_krw`는 우리가 넣은 단가표로 계산한 **추정 비용**이다. 실제 청구는 Anthropic 콘솔 사용량과 한 번 맞춰 본다.

### 4-6. 임시안 가격과 비교하는 표 (시범 값으로 채움)
임시안 단가: 포함분 59,000원 ÷ 2,000건 = **29.5원/건**, 추가 팩 19,000원 ÷ 1,000건 = **19원/건**. (부가세 별도)

| 샵 | 기간 | 자동응답 | 성공 호출 | 비용(원) | 자동응답 1건당(원) | 성공 호출 1건당(원) | 월 환산 응답(건) | 월 환산 비용(원) | 임시안 월 청구(원) | 원가율(월 비용 ÷ 59,000) | 포함 2,000건 대비 | 팩 단가 19원 대비 1건 원가 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 타타타렌탈샵 | | | | | | | | | 59,000 | | | |
| (시범 샵 2) | | | | | | | | | 59,000 | | | |
| 합계·평균 | | | | | | | | | | | | |

- "포함 2,000건 대비" = 월 환산 성공 호출 ÷ 2,000. 1을 넘으면 팩이 필요한 샵이다.
- 원가율에 서버·인건비는 들어 있지 않다. AI 비용만이다.

---

## 5. 본사 관리자 화면

### 5-1. 위치와 구성
- `/admin/ai`에 "AI 상담 사용권" 칸을 더하거나 `/admin/ai/consult` 새 화면(추천: 새 화면, 표가 넓다). 데스크톱 우선, 모바일은 가로 스크롤 표.
- **사용권 표**(한 줄 = 한 샵): 샵 이름 · 상태(체험 대기/체험/유료/중지 + 이유) · 시작일 · 종료일 · 남은 일수(7일 이하 강조) · 이번 달 응답 / 한도(팩 포함) · 비율 막대 · 자동응답 수 · 비용(원) · 1건당 비용 · 하루 최대 / 상한 · 채널(카카오·인스타 켜짐) · 마지막 변경(누가·언제).
- 필터: 상태, "7일 안에 끝남", "80% 넘음", 달 선택(지표 카드와 같은 `?month=`).
- **요금제** 칸: 지금 쓰는 요금제 값, [새 요금제] (새 행 + 옛 행 끄기).

### 5-2. 버튼 (모두 본사 전용 RPC, 감사 기록)
| 버튼 | RPC(제안) | 입력 | 확인 |
|---|---|---|---|
| 체험 부여 | `consult_admin_grant_license(p_shop, p_plan, p_mode, p_starts_at)` | 시작 기준: 첫 자동응답(기본) / 날짜 지정 | 이미 사용권이 있으면 거부(연장을 쓰게) |
| 유료 전환 | `consult_admin_set_paid(p_shop, p_starts_at, p_ends_at, p_note)` | 청구 기간(예: 12/1~12/31), 청구 메모 | 종료일은 시작일 뒤 |
| 연장 | `consult_admin_extend(p_shop, p_ends_at, p_note)` | 새 종료일 | 중지 상태면 "다시 켜기"도 함께(상태 되돌림 + 샵에 알림) |
| 중지 | `consult_admin_suspend(p_shop, p_reason, p_note)` | 이유(본사/미납/해지) | 화면 안 확인 단계(브라우저 confirm 대신 두 번 누르기) |
| 팩 추가 | `consult_admin_add_pack(p_shop, p_month, p_count)` | 달, 팩 수 | 이번 달·다음 달만 |
| 포함량·하루 상한 조정 | `consult_admin_set_quota(p_shop, p_included, p_daily_cap)` | 숫자 | 범위 확인 |
| 이력 보기 | `audit_events`(본사 읽기 정책 있음) | | |

- 본사도 손님 상담 표는 못 읽는다(기존 설계 유지). 숫자는 `consult_admin_license_overview`로만.

### 5-3. 알림
| 언제 | 누구에게 | 종류(`notifications.kind`) | 방법 |
|---|---|---|---|
| 만료 3일 전(사장님 결정) | 그 샵 멤버(대표 포함) | `consult_license_expiring` | 앱 알림 목록 + 웹푸시. 알림톡은 승인 뒤 |
| 만료 7일 전 | 본사 | (알림 없음, 화면 강조) | 사용권 표 "7일 안에 끝남" 필터·강조. 본사는 매일 보는 화면이라 알림까지는 두지 않는 것을 추천(9절 Q10) |
| 끝나서 중지됨 | 샵 멤버 + 본사 | `consult_license_suspended` | 같음 |
| 이번 달 80%·100% | 샵 멤버 + 본사 | `consult_quota_warning`·`consult_quota_reached` | 같음, 달마다 한 번 |

- 만드는 곳: 매일 정리 작업(03:00 KST)이 `consult_license_sweep()`에서 쌓는다. 웹푸시는 `notify/dispatch`(09:00 KST)가 보낸다 → 손님 없는 새벽에 쌓이고 아침에 받는다. 100% 도달은 `ai_gate`가 처음 막을 때 바로 쌓는다(`ai_cap_reached`와 같은 방식).
- 문구는 `src/lib/notify/messages.ts`에 종류를 더한다(6-2 초안).

---

## 6. 만료·해지 시 데이터 처리와 샵 안내 문구

### 6-1. 데이터 처리
| 데이터 | 중지(체험 끝·만료·미납) | 해지(샵이 그만둠) |
|---|---|---|
| 사용권 행 | `suspended` + 이유. 지우지 않음 | `suspended` + `terminated`. 지우지 않음(이력·청구 근거) |
| 자동응답 설정 | `auto_reply_enabled = false`(감사 기록) | 같음 |
| 안내 정보(`shop_knowledge`) | 남김(샵 자료, 다시 켤 때 그대로) | 남김. 샵 탈퇴 때 샵 자료와 함께 처리(`docs/shop-offboarding.md`) |
| 대화·메시지·피드백 | **90일 보존 규칙 그대로**(`purge_consult_data`) | 같음 |
| 문의 | 같음(강습 등록 문의만 연락처 지워 보존) | 같음 |
| 채널 | 카카오·인스타 연결 유지 → 손님 메시지는 AI 없이 사장님께 | 본사가 카카오 채널 `enabled = false`, 인스타는 `consult_disconnect_channel`(토큰 삭제). 샵에 오픈빌더 스킬 주소를 지우라고 안내. 꺼진 뒤 카카오는 기본 안내만 |
| `ai_usage` | 남김(청구 근거) | 남김. 보관 기간은 거래 기록 보관 기간과 같이 법률 검토(의뢰서 질문 4) |
| `audit_events` | 남김(고칠 수 없음) | 남김 |

### 6-2. 샵 안내 문구 (초안)
| 언제 | 문구 |
|---|---|
| 사용권 없음(설정 화면) | "AI 상담은 별도 신청 서비스예요. 본사에 사용을 요청하시면 10일 무료 체험을 열어 드려요. 안내 정보는 지금 미리 채워 두실 수 있어요." |
| 체험 부여(알림) | "AI 상담 무료 체험이 열렸어요. AI 자동 응대를 켜고 첫 자동 답변이 나간 때부터 10일 동안 무료로 쓰실 수 있어요. 체험이 끝나도 자동으로 요금이 청구되지 않아요." |
| 체험 시작(설정 화면) | "무료 체험 중 — {종료일}까지 ({N}일 남음)" |
| 만료 3일 전(알림) | "AI 상담 {체험/이용} 기간이 {종료일}에 끝나요. 계속 쓰시려면 본사에 연장을 요청해 주세요. 끝나면 AI 자동 답변이 멈추고 모든 문의가 사장님께 넘어가요." |
| 중지됨(알림·인박스 띠) | "AI 상담 기간이 끝나 자동 답변을 멈췄어요. 손님 문의는 계속 이 화면으로 들어와요. 직접 답해 주세요. 다시 쓰시려면 본사에 요청해 주세요." |
| 80% 사용(알림) | "이번 달 AI 응답을 {사용}/{한도}건 썼어요. 다 쓰면 그달 말까지 자동 답변이 멈추고 사장님께 넘어가요. 추가 {팩 크기}건이 필요하면 본사에 요청해 주세요." |
| 100% 사용(알림·띠) | "이번 달 포함 AI 응답을 모두 썼어요. {다음 달 1일}까지 손님 문의는 사장님께 넘어가요. 추가 응답이 필요하면 본사에 요청해 주세요." |
| 연장·다시 켜기(알림) | "AI 상담이 {종료일}까지 연장됐어요. 설정 화면에서 AI 자동 응대를 다시 켜 주세요." |
| 해지 확인(알림·메일은 사람이) | "AI 상담 해지를 마쳤어요. 카카오 오픈빌더의 스킬 주소를 지워 주세요. 지난 상담 기록은 90일 동안 보관한 뒤 삭제돼요(강습 등록으로 넘긴 문의는 연락처를 지우고 남아요)." |

문구 속 숫자({한도}, {팩 크기}, 10일)는 요금제 표에서 읽어 넣는다.

---

## 7. 기존 시범 샵 이행

### 7-1. 현재 상황 (문서 기준, 운영 DB는 조회하지 않음)
- 2026-11-06 원격 적용 기록(`docs/pending-migrations.md`): 운영 샵 2곳(모두 테스트), 상담 설정 2행 모두 자동응답 **꺼짐**, `shop_channels` 0행.
- P22-8(타타타렌탈샵 카카오 연결)은 아직 todo. 즉 지금 운영에서 AI 상담을 켠 샵은 없다고 본다. 적용 직전에 다시 센다.

### 7-2. 방법 (추천)
1. P23-2 마이그레이션이 **자동 이행**을 한다: `auto_reply_enabled = true`이거나 `shop_channels.enabled = true`인 샵에 `standard_v1` **체험(첫 자동응답 기준, 대기)** 을 넣는다. 감사 기록 `consult_license_granted`(detail `{"migration": true}`). 이미 자동응답이 나간 샵이면 시작을 적용 시각으로 한다(시범 샵이 적용 직후 갑자기 끊기지 않게).
2. 지금 숫자대로면 0행이다. 적용 승인 요청 때 `migration-preflight.mjs` 결과와 함께 "대상 샵 수"를 읽기 조회로 보고한다.
3. **타타타렌탈샵은 P23-5에서 본사 화면으로 직접 부여**한다. P22-8 시범 일정에 맞춰 "시작일 지정"을 쓰는 것을 추천(시범 시작일 = 체험 시작일, 10일 안에 비용·만족도를 본다). P22-8이 P23-2보다 먼저 끝나면 1번 자동 이행이 잡는다.
4. 켜짐 스위치(`consult_license_required`)는 이행·부여를 확인한 뒤에 true로 바꾼다(8절). 그 전에는 사용권이 없어도 지금처럼 동작한다.

자동 부여를 하지 않는 대안: 모든 샵을 사용권 없음으로 시작하고 본사가 하나씩 부여. 단순하지만 스위치를 켜는 순간 시범 샵이 끊길 수 있어 추천하지 않는다.

---

## 8. 작업 쪼개기

| 순서 | 작업 | 내용 | 크기(추정) | 시험 |
|---|---|---|---|---|
| 1 | **P23-2a 마이그레이션 1개** | 표 3개 + RLS·열 권한, 요금제 임시안 1행, `consult_license_ok`, 체험 시작 트리거, `ai_gate`·`set_consult_settings`·`consult_quota_ok`·`consult_connect_instagram` 다시 정의(기존 본문 그대로 + 확인 추가), 켜짐 스위치(기본 false), 본사 RPC 6개, `consult_admin_license_overview`, `consult_my_usage`, `consult_license_sweep`, 자동 이행. 머리 주석에 되돌리기 | L (SQL 약 450~550줄) | pgTAP 새 파일 `consult_license.test.sql` 약 40~60개: 샵 읽기만·`admin_note` 못 읽음·강사·다른 샵·anon 0건, 본사만 RPC, 스위치 꺼짐이면 지금 동작, 사용권 없음·중지·만료·시작 전 → `no_license`, 포함량 초과 → `monthly_quota`(팩 더하면 풀림), 하루 상한 유지, 켜기 거부·끄기 허용, 첫 자동응답에 체험 시작(한 번만), 정리 작업 중지·알림 한 번, 감사 기록. 기존 `consult.test.sql`·`ai_usage.test.sql` 통과 확인 |
| 2 | **P23-2b 차단 로직(앱)** | 웹훅 두 곳 사용권 확인(카카오 3.5초 안, 쿼리 1개) → AI 없이 넘김, 엔진 이유 `no_license`·`monthly_quota`, 설정 화면 켜기 막힘 안내·사용량 표시, 인박스 띠, 인스타 연결 막기, 알림 종류·문구, 매일 정리 작업에서 `consult_license_sweep` 호출 | M (파일 10~14개, 400~600줄) | 단위: `kakao/webhook.test.ts`·`instagram/webhook.test.ts`(사용권 없음 → 엔진 안 부름·문의 열림·안내 한 번), `privacy.test.ts`(실제 의존성), `engine.test.ts`(게이트 이유), `messages.test.ts`, `maintenance/daily/route.test.ts` |
| 3 | **P23-3 관리자 화면** | `/admin/ai/consult`(표·필터·버튼 6개·요금제), 사용권 이력 | M (파일 5~8개, 400~600줄) | 단위(표시 계산), E2E |
| 4 | **E2E** | `e2e/ai-consult-license.spec.ts`: 본사 부여 → 샵 켜기 가능 → 가짜 카카오 웹훅 첫 자동응답 → 체험 날짜 표시 → 본사 중지 → 웹훅이 AI 없이 넘김·인박스 띠·켜기 막힘 → 연장 → 다시 켜기. 390px 샵 화면 | M (1~2파일) | 기존 `ai-consult-*.spec.ts`는 시험 샵에 사용권 시드를 넣어 그대로 통과(시드 `supabase/seed.sql` 또는 시험 준비 단계). E2E 기본은 AI 끈 상태, 상담 시험만 가짜 모델 |
| 5 | **P23-4 약관·청구 문구** | 법률 검토 회신 반영 → `/terms`·`/privacy` 문구, 청구서(앱 밖) 양식 | S~M | blocked(법률 검토) |
| 6 | **P23-5 시범 샵 이행** | 타타타렌탈샵 체험 부여(시작일 지정), 스위치 켜기, 첫 주 비용 표(4-6) 채우기 | S | 운영 확인(사장님 승인) |

### 8-1. 원격 적용 순서 (적용 먼저, 병합 나중)
1. P23-2 풀 리퀘스트(마이그레이션 + 앱 코드). `docs/pending-migrations.md`에 파일 추가(CI 확인, `migration-pending` 라벨).
2. CI 통과 → 사장님께 적용 승인 요청: `node scripts/ops/migration-preflight.mjs` 결과 + 영향 행 수(자동 이행 대상 샵 수, 요금제 1행, `app_settings` 키 1개).
3. **사장님 승인 뒤** 원격 적용(`npx supabase db push --linked`). 스위치가 false라 적용해도 지금 동작이 바뀌지 않는다(기존 코드는 새 표를 읽지 않는다).
4. 적용 확인(새 표·함수·RLS, 기존 게이트 `ok`) → **그다음 병합**(= 운영 배포). 새 화면 코드가 새 표를 읽으므로 이 순서를 지킨다.
5. P23-3 화면 병합(마이그레이션 없음이면 바로). 본사 화면에서 시범 샵 사용권 확인·부여(P23-5).
6. 사장님이 SQL Editor에서 `consult_license_required = true`. 되돌리기는 false.
7. 운영 확인: 사용권 없는 시험 샵 웹훅 → AI 호출 0·문의 열림, 사용권 있는 샵 → 자동응답.

- 브랜치·PR·CI·병합은 CLAUDE.md 절차 그대로(`task/P23-2` …). 병합은 사장님 승인 뒤.
- 마이그레이션을 둘로 나누지 않는 이유: 스위치로 켜는 시점을 따로 잡을 수 있어서, 한 번 적용·한 번 승인이 더 단순하다.

---

## 9. 열린 질문 (사장님이 정할 것)

임시안이 있는 것은 "지금 값"에 적었다. 추천은 제 의견이다.

| # | 질문 | 선택지 | 지금 값 / 추천 |
|---|---|---|---|
| Q1 | **"응답 1건"은 무엇인가** | (a) 손님에게 나간 AI 자동응답만 (b) AI가 처리한 손님 메시지(자동응답 + 사장님께 넘긴 초안, 성공 호출 기준·재시도 실패 제외) (c) 모든 AI 호출(실패·재시도 포함) | **추천 (b)**. 비용과 맞고 DB에서 세기 쉽다. (a)는 샵에 유리하지만 초안 비용이 안 잡히고, (c)는 우리 실패까지 샵이 낸다 |
| Q2 | 체험 10일 세는 법 | (a) 시작 시각 + 240시간 (b) 한국 날짜 기준, 시작일 포함 10일째 밤 24시 | **추천 (b)**. 예: 11/10 14시 시작 → 11/19 24시(11/20 0시 KST) 종료. 샵에 날짜로 설명하기 쉽다 |
| Q3 | 체험 대기(첫 자동응답 전)를 얼마나 둘까 | (a) 끝없이 (b) 부여 후 N일 지나면 그날부터 시작 (c) 대기 중에는 초안 호출도 막기 | **추천 (b) 14일**. 자동응답을 켜지 않고 초안만 계속 쓰는 경우를 막는다 |
| Q4 | 월 요금·포함량·팩 가격 | 임시안 그대로 / 시범 비용(4-6) 보고 조정 | 지금 값: 59,000원(부가세 별도)·2,000건·1,000건 19,000원. **추천: 시범 첫 주 표를 채운 뒤 확정** |
| Q5 | 하루 상한 300과 월 2,000건의 관계 | (a) 둘 다 유지(하루는 남용 방지, 월은 청구) (b) 하루 상한을 월 한도에서 나눠 계산(예: 한도 ÷ 남은 날) (c) 유료 샵은 하루 상한 없애기 | **추천 (a)**. 300은 도배 방지로 남기고, 큰 샵만 사용권 `daily_cap`으로 올린다 |
| Q6 | 팩 유효 기간 | (a) 산 달만 (b) 다음 달로 넘김 (c) 사용권 끝날 때까지 | **추천 (a)**. 계산이 단순하고 청구와 맞다 |
| Q7 | 달 중간 시작(유료 전환)의 포함량·요금 | (a) 포함량 전량·요금 일할(앱 밖) (b) 포함량·요금 모두 일할 (c) 다음 달 1일부터 유료 | **추천 (a)**. 앱은 달마다 전량, 첫 달 요금은 청구서에서 일할 |
| Q8 | 포함량 경고 | 80%·100% / 100%만 / 90%·100% | **추천 80%·100%** (샵·본사 모두) |
| Q9 | 중지 뒤 연장하면 자동응답을 다시 켤까 | (a) 저절로 다시 켜짐 (b) 사장님이 다시 켬 | **추천 (b)**. 중지 때 끄고, 연장 알림에 "다시 켜 주세요" |
| Q10 | 만료 알림 대상·시점 | 샵 3일 전(결정) + 본사 7일 전 알림 / 본사는 화면 강조만 | **추천: 본사는 화면 강조만**. 필요하면 본사도 3일 전 알림 |
| Q11 | 알림 채널 | 앱 알림 목록 + 웹푸시 / 이메일 추가 / 알림톡(승인 뒤) | **추천: 앱 알림 + 웹푸시**. 알림톡이 승인되면 만료 3일 전만 알림톡으로 |
| Q12 | 플랫폼 월 AI 비용 상한(80,000원, 모든 기능 공용) | (a) 그대로 (b) 상담은 유료 샵 수에 맞춰 따로 (c) 유료 샵 상담은 플랫폼 상한에서 빼기 | **추천: 시범 동안 (a)**, 유료 샵이 5곳을 넘으면 (b) 다시 정함 |
| Q13 | 중지된 샵의 채널 | (a) 연결 유지, 사장님께 넘김(이 문서 기본) (b) 중지 N일 뒤 채널도 끔 | **추천 (a)**. 손님 문의가 사라지지 않는다. 해지 때만 끈다 |
| Q14 | 유료의 종료일 | (a) 꼭 넣음(청구 끝난 날까지, 미납이면 저절로 멈춤) (b) 무기한, 본사가 중지 | **추천 (a)** |
| Q15 | 청구 방식(앱 밖) | 선불 월정액 / 후불 / 세금계산서 발행 주기 | 앱과 무관, 법률·세무 확인 뒤(P23-4) |
| Q16 | 사용권 없는 샵에 새 인스타 연결 허용 | 허용 / 사용권 있을 때만 | **추천: 사용권 있을 때만** |
| Q17 | 샵이 보는 화면에 가격 표시 | 표시 / 숨김(본사 안내) | **추천: 약관 확정(P23-4) 전에는 숨김**, 포함량·사용량만 표시 |

---

## 부록 — 이번 작업에서 하지 않은 것
- 코드·마이그레이션·운영 DB 조회·환경변수·외부 계정: 없음.
- 가격 확정: 하지 않음(임시안만, 요금제 표 값으로).
- 약관 확정 문구: 하지 않음. 검토용 초안은 `docs/legal-review-packet.md` 4절.
