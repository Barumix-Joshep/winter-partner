# 시범 샵 AI 상담 체험 사용권 런북 (P23-5)

사장님이 그대로 따라 하는 순서입니다. 2026-11-06 작성, P23-2(사용권 표·판정, 운영 적용 2026-11-06 12:18 KST)와 P23-3(본사 화면 `/admin/ai/consult`, PR #48) 기준.
**이 문서를 쓴 시점에는 아무것도 실행하지 않았습니다.** 켜짐 스위치는 `false`, 사용권은 0건입니다.

- SQL은 모두 Supabase 대시보드 → 프로젝트 winter-partner → **SQL Editor**에서 실행합니다. 하나씩 붙여 넣고 Run.
- `읽기`라고 적은 SQL은 데이터를 바꾸지 않습니다. `쓰기`라고 적은 SQL은 이 문서에서 **스위치 켜기·끄기 두 개뿐**입니다.
- 샵 id·이름은 결과에 나오지만 손님 글·연락처는 나오지 않습니다.

## 0. 시작 전에 (모두 "예"여야 시작)
| 확인 | 어디서 |
|---|---|
| 타타타렌탈샵이 가입·샵 등록·**본사 승인**까지 끝났다 | 본사 관리 → 샵 승인 |
| 카카오 채널이 연결돼 웹훅이 동작한다(P22-8) | `docs/kakao-setup.md` |
| Vercel에 `CONSULT_ENCRYPTION_KEY`·`CONSULT_HASH_KEY`가 있다 | Vercel → Settings → Environment Variables(이름만 확인) |
| 샵이 `AI 상담 안내 정보`에서 실제 내용으로 고친 항목을 켰다 | 샵 화면 |
| 법률 검토 전이라면 [테스트] 데이터로만 하거나, 실제 손님 상대 전 회신을 받았다 | `docs/legal-review-packet.md` |

## 1. 지금 상태 확인 (읽기)
```sql
select
  (select value #>> '{}' from private.app_settings where key = 'consult_license_required') as license_required, -- false여야 함
  (select count(*) from consult_plans where code = 'standard_v1' and active)                as standard_v1,      -- 1
  (select count(*) from consult_licenses)                                                   as licenses;         -- 부여 전 0
```
```sql
-- 타타타렌탈샵의 id와 자동응답·채널 상태 (이름은 실제 등록 이름으로)
select s.id, s.name, s.status,
       cs.auto_reply_enabled,
       (select string_agg(c.channel || ':' || c.enabled, ', ') from shop_channels c where c.shop_id = s.id) as channels,
       l.status as license_status, l.starts_at, l.ends_at
from shops s
left join shop_consult_settings cs on cs.shop_id = s.id
left join consult_licenses l on l.shop_id = s.id
where s.name like '%타타타%';
```

## 2. 체험 사용권 부여 (본사 화면)
1. 본사 계정으로 로그인 → **본사 관리** → **"AI 상담 사용권"** (또는 `/admin/ai` → "AI 상담 사용권 관리").
2. 사용권 표에서 **타타타렌탈샵** 줄의 **[관리]**.
3. **"체험 부여"** 칸 → 시작 기준 **"날짜 지정"** → 시작일 = 시범 시작일(예: 시범 첫날) 입력.
   - 시범 첫날을 정하지 못했으면 기본값 **"첫 자동응답 기준"**: 첫 자동응답이 나간 날부터 10일, 부여 후 14일 안에 첫 자동응답이 없으면 14일째부터 시작.
4. (선택) 본사 메모 → **[체험 부여]**.
5. 표에 **"체험 · 시작 전"**(지정일 전) 또는 **"체험"** 과 시작일·종료일이 보이면 끝. 종료일은 요금제의 체험 일수(10일)로 자동 계산됩니다(한국 날짜, 시작일 포함 10일째가 마지막 날).

확인 (읽기):
```sql
select l.status, l.start_mode,
       l.starts_at at time zone 'Asia/Seoul' as starts_kst,
       l.ends_at   at time zone 'Asia/Seoul' as ends_kst,   -- 마지막 날 다음 날 0시
       l.included_monthly_responses, l.overage_policy, l.granted_at at time zone 'Asia/Seoul' as granted_kst
from consult_licenses l join shops s on s.id = l.shop_id
where s.name like '%타타타%';
```
```sql
select created_at at time zone 'Asia/Seoul' as kst, action, detail
from audit_events
where target_table = 'consult_licenses' and shop_id = (select id from shops where name like '%타타타%')
order by created_at desc limit 5;   -- consult_license_granted 한 줄
```

## 3. 켜짐 스위치 켜기 (쓰기 — 사장님만)
**켜기 전에 꼭**: 1번의 사용권 표에서 **사용권이 있어야 할 샵이 모두 부여돼 있는지** 봅니다. 스위치를 켜는 순간 **사용권이 없는 샵은 AI 상담이 꺼집니다**(손님 문의는 AI 없이 사장님께 넘어감). 체험이 이미 끝난 샵도 바로 막히므로, 필요하면 먼저 본사 화면에서 **연장**합니다.

켜기:
```sql
update private.app_settings set value = 'true'::jsonb where key = 'consult_license_required';
```
되돌리기(끄기) — 이상하면 바로:
```sql
update private.app_settings set value = 'false'::jsonb where key = 'consult_license_required';
```
확인 (읽기):
```sql
select value #>> '{}' as license_required from private.app_settings where key = 'consult_license_required';
select s.name, private.consult_license_ok(s.id) as license, (select reason from ai_gate(s.id, 'consult')) as consult_gate
from shops s order by s.name;   -- 타타타: ok / ok, 사용권 없는 샵: no_license / no_license
```

## 4. 첫 자동응답 뒤 체험 날짜 확인
"첫 자동응답 기준"으로 부여했다면, 손님에게 첫 AI 답이 나가면 체험이 시작됩니다(날짜 지정이면 이미 정해져 있음).
```sql
select l.status, l.starts_at at time zone 'Asia/Seoul' as starts_kst, l.ends_at at time zone 'Asia/Seoul' as ends_kst
from consult_licenses l join shops s on s.id = l.shop_id where s.name like '%타타타%';
```
```sql
select created_at at time zone 'Asia/Seoul' as kst, detail
from audit_events
where action = 'consult_trial_started' and shop_id = (select id from shops where name like '%타타타%');
-- detail.by = first_auto_reply (첫 자동응답) 또는 wait_elapsed (14일 대기 끝)
```
샵 화면 `AI 상담 안내 정보` 위쪽에도 남은 체험 일수와 이번 달 사용량이 보입니다(스위치를 켠 뒤).

## 5. 만료 3일 전 알림 확인
- 매일 03:00 KST 정리 작업(`consult_license_sweep`)이 종료 3일 안에 든 사용권에 알림을 쌓고, 09:00 KST 알림 발송이 웹푸시로 보냅니다. **스위치가 켜져 있을 때만** 쌓입니다.
```sql
select n.created_at at time zone 'Asia/Seoul' as kst, n.kind, n.payload, n.read_at is not null as read
from notifications n
where n.kind in ('consult_license_expiring', 'consult_license_suspended', 'consult_quota_warning', 'consult_quota_reached')
order by n.created_at desc limit 10;
```
- 종료일 3일 전 아침에 타타타 대표 계정에 `consult_license_expiring` 1건이 있어야 합니다. 체험이 끝나면 다음 03:00에 `consult_license_suspended`(샵·본사)와 함께 사용권이 **중지**되고 자동응답이 꺼집니다(자동 유료 전환 없음).
- 정리 작업 결과: `docs/ops-check.md` "매일 정리 작업 점검" ⑥.

## 6. 연장·유료 전환 (본사 화면)
- **연장**: [관리] → "연장" → 새 종료일(마지막 날 포함) → [연장]. 중지 상태면 버튼이 **"연장하고 다시 켜기"** 로 바뀝니다. 자동응답은 **대표님이 다시 켜야** 합니다(9절 Q9).
- **유료 전환**: [관리] → "유료 전환" → 청구 기간(시작·끝)과 메모 → 버튼. 청구는 앱 밖에서 합니다.
- **팩 추가**: [관리] → "팩 추가" → 달(이번 달/다음 달) → 팩 수 → [팩 추가]. 표에 "팩 +N".
- **중지**: [관리] → "중지" → 이유 → [중지…] → [중지 확정].

## 7. 첫 주 실제 비용 표 채우기 (읽기)
`docs/ai-consult/paid-service-design.md` 4-5의 SQL을 그대로 씁니다. 첫 줄 두 날짜(시범 시작일 0시, 7일 뒤 0시, 한국 시간)만 바꿔 실행하고, 결과를 같은 문서 4-6 표에 옮깁니다.
```sql
-- 시범 기간(한국 시간): 시작·끝 날짜만 바꾼다. 끝 날짜는 그날 0시라 그날은 빠진다
with p as (
  select timestamptz '2026-11-24 00:00:00+09' as f,
         timestamptz '2026-12-01 00:00:00+09' as t
),
u as (
  select x.shop_id, count(*) as calls, count(*) filter (where x.ok) as ok_calls, sum(x.cost_krw) as cost_krw
  from public.ai_usage x, p
  where x.feature = 'consult' and x.shop_id is not null and x.created_at >= p.f and x.created_at < p.t
  group by x.shop_id
),
a as (
  select m.shop_id, count(*) as auto_replies
  from public.messages m, p
  where m.role = 'ai' and m.delivery_status = 'sent' and m.sent_at >= p.f and m.sent_at < p.t
  group by m.shop_id
)
select s.name as 샵, u.calls as 호출, u.ok_calls as 성공_호출, coalesce(a.auto_replies, 0) as 자동응답,
       round(u.cost_krw, 1) as 비용_원,
       round(u.cost_krw / nullif(a.auto_replies, 0), 2) as 자동응답_1건당_원,
       round(u.cost_krw / nullif(u.ok_calls, 0), 2) as 성공_호출_1건당_원,
       round(u.cost_krw * 30 / (extract(epoch from p.t - p.f) / 86400), 0) as 월_환산_비용_원,
       round(u.ok_calls * 30 / (extract(epoch from p.t - p.f) / 86400)) as 월_환산_성공_호출
from u join public.shops s on s.id = u.shop_id cross join p left join a on a.shop_id = u.shop_id
order by 비용_원 desc;
```
비교 기준(임시안, 요금제 값): 포함분 59,000원 ÷ 2,000건 = **건당 29.5원**, 팩 19,000원 ÷ 1,000건 = **건당 19원**. "성공_호출_1건당_원"이 청구 단위 원가입니다(결정 Q1). 본사 화면 `/admin/ai/consult`의 "1건당 비용" 칸과 같은 정의입니다.

## 8. 시험: 사용권 없는 샵은 AI 호출 0, 문의는 사장님께
**A. 로컬 시험(언제든, 운영과 무관)** — Claude Code에 "사용권 차단 시험 돌려 줘"라고 하면 됩니다. 내용:
```
E2E_SERVER=start npx playwright test e2e/ai-consult-license.spec.ts
```
가짜 카카오·인스타 웹훅으로, 사용권 없는 [테스트] 샵에 손님 메시지를 보내 **AI 호출 0(ai_usage 늘지 않음)**, **문의 열림·"사장님께 전달" 안내 한 번**, 사용권을 주면 다시 자동응답이 되는 것을 확인합니다(스위치는 시험 안에서만 켜고 끝나면 끔, 로컬 DB만).

**B. 운영 확인(스위치를 켠 뒤, 실제 채널이 있는 사용권 없는 샵이 있을 때만)**
1. 그 샵 채널로 [테스트] 문구("[테스트] 강습료 얼마예요?")를 하나 보낸다.
2. 읽기:
```sql
-- 보낸 시각 뒤로 이 샵의 상담 AI 호출 수 → 0이어야 함
select count(*) as consult_ai_calls
from ai_usage where feature = 'consult'
  and shop_id = (select id from shops where name = '<사용권 없는 샵 이름>')
  and created_at > now() - interval '10 minutes';
-- 열린 문의 → 1건 늘어야 함
select count(*) as open_inquiries from inquiries
where shop_id = (select id from shops where name = '<사용권 없는 샵 이름>') and status = 'open'
  and created_at > now() - interval '10 minutes';
```
3. 그 샵 인박스 `/shop/ai-consult/inbox`에 문의가 보이고, 위쪽에 사용권 안내 띠가 있으면 정상.
- 실제 채널이 연결된 사용권 없는 샵이 없으면 B는 건너뛰고 A로 갈음합니다(운영에 시험용 채널을 따로 만들지 않습니다).

## 9. 문제가 생기면
| 증상 | 할 일 |
|---|---|
| 스위치를 켰더니 시범 샵 자동응답이 멈춤 | 3번의 확인 SQL에서 그 샵 `license`가 `ok`인지. 아니면 **바로 끄기 SQL**, 그다음 본사 화면에서 부여·연장 후 다시 켜기 |
| 체험 날짜가 이상함 | 4번 SQL 결과와 화면을 캡처해 Claude Code에 전달(손님 글은 보내지 않음). 본사 화면 "연장"으로 고칠 수 있다 |
| 만료 알림이 안 옴 | 스위치가 켜져 있었는지, `docs/ops-check.md` ⑥의 `expiry_notices` 숫자, 알림 발송(09:00) 기록 확인 |
| 잘못 부여함 | 지금은 **취소 기능이 없다**(P23-3 보고: 스키마 필요). 중지로 막고 Claude Code에 알린다 |
