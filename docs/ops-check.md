# 운영 점검 (P16-1)

2026-11-02 기준으로 **읽기만** 해서 확인했다. 설정은 하나도 바꾸지 않았다. 사용한 명령: `supabase backups list`, `supabase config diff`(원격과 로컬 설정 비교), `vercel logs`, `vercel crons list`, `vercel env ls`(이름만), 운영 DB `notifications` 건수.

## 결과 한눈에
| 항목 | 상태 | 내용 |
|---|---|---|
| DB 자동 백업 | ⚠️ 없음 | 백업 목록이 비어 있고 PITR(시점 복구)도 꺼져 있다. 무료 요금제로 보인다. 지금은 복구할 수 있는 시점이 없다 |
| 인증 메일 발송 | ❌ 시범 전에 꼭 고칠 것 | 커스텀 SMTP가 없어 Supabase 내장 메일을 쓴다. 내장 메일은 **시간당 2통**이고 **조직 팀원 주소로만** 간다. 원격에서는 가입 메일 인증이 켜져 있어, 시범 샵 사장님이 가입하면 인증 메일을 못 받는다 |
| 메일 재전송 간격 | ✅ | 같은 주소로 1분에 1번 |
| Auth Site URL | ✅ | `https://winter-partner.vercel.app` |
| Redirect URL | ✅ (참고 있음) | `https://winter-partner.vercel.app/auth/confirm` 1개뿐이다. 로컬 개발은 로컬 Supabase를 써서 운영에 localhost를 넣을 필요는 없다. Preview 배포 주소는 목록에 없어서, Preview에서 가입하면 운영 주소로 돌아간다 |
| 비밀번호 재설정 | ❌ 화면 없음 | 앱에 "비밀번호를 잊으셨나요" 흐름이 없었다 → P16-3에서 추가한다(역시 메일 발송이 필요) |
| 2단계 인증(TOTP) | ✅ | 원격에서 켜져 있다 |
| 크론 `/api/notify/dispatch` (매일 09:00 KST) | ⚠️ 성공 기록 없음 | Vercel에 크론 2개가 등록돼 있다. 오류 로그는 환경변수를 넣기 전(11/2 06:48 KST) 1건뿐이다. 성공하면 아무것도 남기지 않아 실제로 돌았는지 확인할 수 없다 → P16-2에서 실행 결과를 남긴다. 운영 알림은 1건이고 이미 발송됐다(밀린 것 0) |
| 크론 `/api/maintenance/daily` (매일 03:00 KST) | ⚠️ 위와 같음 | 오류 로그 없음. 성공 기록도 없음 |
| Vercel 런타임 오류 (최근 3일) | ✅ 지금은 없음 | 31건 중 24건은 첫 배포 때 환경변수가 비어 있던 것(11/2 06:31~06:49 KST, 해결됨)이고, 6건은 입찰 보조 AI 400 오류(3d5e16에서 수정)다. 11/2 12:00 KST 이후 0건 |
| 운영 환경변수 | ✅ | 필요한 8개가 있다(값은 보지 않음): Supabase 3, VAPID 3, CRON_SECRET, ANTHROPIC_API_KEY |

## 사장님이 할 일
| # | 할 일 | 왜 | 비용 | 급한 정도 |
|---|---|---|---|---|
| 1 | **메일 발송 서비스 가입 + 도메인** (아래 비교) → Supabase Auth → SMTP 설정 | 이게 없으면 시범 샵이 가입·비밀번호 재설정 메일을 못 받는다 | 메일 0원부터 + 도메인 연 1~3만 원 | 시범 전 필수 |
| 1-대안 | 메일 서비스 준비 전까지 Supabase Auth의 "Confirm email"을 끄거나, 본사가 계정을 만들어 전달 | 당장 가입을 막지 않으려면 | 0원 | 임시 |
| 2 | Supabase 요금제를 Pro로 올릴지 결정 | Pro는 매일 자동 백업 7일치. PITR은 추가 비용 | 월 $25 | 실제 샵 데이터가 들어오기 전 |
| 2-대안 | 요금제를 올리기 전까지 `scripts/ops/db-backup.sh`로 주 1회 손 백업 (Docker 필요). 결과는 `backups/`에 생기고 git에는 안 올라간다 | 복구할 시점을 하나라도 남기려면 | 0원 | 실제 샵 데이터가 들어오면 |
| 3 | Vercel 대시보드 → Settings → Cron Jobs에서 두 크론의 최근 실행을 한 번 눈으로 확인 | CLI로는 실행 이력이 안 보인다 | 0원 | 이번 주 |
| 4 | (선택) Preview에서도 가입을 시험하려면 Redirect URL에 `https://winter-partner-*-barumix-default.vercel.app/auth/confirm` 추가 | Preview 확인용 | 0원 | 낮음 |

## 메일 발송 서비스 후보 (가입은 사장님이)
둘 다 **자기 도메인**(예: winterpartner.kr)이 있어야 한다. `vercel.app` 주소로는 SPF·DKIM을 설정할 수 없어 네이버·다음 메일에서 스팸으로 가거나 거부된다. 가격은 2026-11-02에 공식 문서·리뷰를 검색해 확인했다(Resend 무료 한도는 공식 블로그·문서 일치, 유료 단계와 SES 무료 한도는 출처마다 달라 가입 전에 공식 요금 페이지를 다시 본다).

| | Resend | Amazon SES |
|---|---|---|
| 무료 한도 | 월 3,000통, 하루 100통 (도메인 1개) | 공식 FAQ는 처음 12개월 월 3,000통. 2026-07부터 새 계정은 크레딧 방식으로 바뀌었다는 글도 있어 확인 필요 |
| 넘으면 | Pro 월 $20 안팎 (월 5만 통) | 1,000통에 $0.10 |
| 시작 난이도 | 쉬움. 도메인 DNS 3줄 넣고 바로 SMTP | 보통. 처음엔 샌드박스라 "운영 전환" 신청이 필요(1~2일) |
| 한국 환경 | 서울 리전 없음(도쿄 발송). 한국어 메일 문제없음 | 서울 리전(ap-northeast-2)에서 발송, Supabase·Vercel과 같은 지역 |
| Supabase 연동 | 공식 연동 안내 있음 | SMTP 정보 직접 입력 |

**추천: Resend.** 시범 운영 규모(가입·재설정 메일 하루 수십 통)는 무료 한도 안이고, 설정이 가장 빠르다. 메일이 월 수만 통으로 늘면 SES로 옮기기 쉽다(SMTP 정보만 바꾸면 됨).

SMTP를 연결하면 Supabase의 시간당 메일 한도(`email_sent`)를 30 정도로 올린다(기본 2는 내장 메일용 값).

출처: [Supabase SMTP 문서](https://supabase.com/docs/guides/auth/auth-smtp) · [Resend 무료 한도](https://resend.com/blog/new-free-tier) · [Resend 요금](https://resend.com/pricing) · [Amazon SES 요금](https://aws.amazon.com/ses/pricing/) · [SES FAQ](https://aws.amazon.com/ses/faqs/)

---

## 매일 정리 작업 점검 — 90일 보존 정리 (P22-6, 2026-11-06 추가)

`/api/maintenance/daily`는 Vercel Cron으로 **매일 03:00 KST**(18:00 UTC)에 돈다. 하는 일은 네 가지다.
1. 보존 기간(마지막 강습 후 3시즌)이 지난 손님 익명화 — `purge_expired_customers()` → `anonymizedCustomers`
2. 2년 지난 접속 기록 삭제 — `purge_access_logs()` → `purgedAccessLogs`
3. **AI 상담 90일 정리** — `purge_consult_data()` → `purgedConsult` (90일 지난 대화·메시지·피드백 삭제, 그 대화의 문의는 삭제하되 **강습 등록으로 넘긴 문의(`converted`)만 연락처·대화 연결·AI 초안을 비워 남김**)
4. 인스타 장기 토큰 갱신(만료 7일 전) → `instagramTokens` (메타 환경변수가 없으면 건너뜀)

결과는 `ops_events`에 한 줄 남는다(`kind = 'cron_run'`, `source = '/api/maintenance/daily'`). 성공이면 `ok = true`이고 `detail`에 건수 JSON, 실패면 `ok = false`이고 `detail`이 `실패: …`다. 개인정보는 남기지 않고 건수만 남긴다.
**`detail`은 300자까지라서, 안쪽 건수 중 0인 항목은 기록에서 뺀다(없는 항목 = 0).** 예: `purgedConsult`가 `{}`이면 다섯 건수가 모두 0이다. 건수가 아주 커서 그래도 300자를 넘으면 맨 위 값만 남기고 `"cut": true`를 붙인다. 빠짐없는 결과는 언제나 Vercel 로그의 `cron maintenance/daily` 줄에 있다.
**2026-11-07 03:00 기록은 이 규칙 전에 남아 300자에서 잘렸다**(JSON이 깨져 ①의 `error` 칸에 "기록 잘림"으로 보인다). 그 실행의 전체 결과는 Vercel 로그에서 확인했다: 모든 건수 0, `consultLicenses.required = false`, 인스타 `skipped: true`(`docs/evening-report-2.md`).

**P22-6 코드로 도는 첫 실행: 2026-11-07 03:00 KST.**

### 점검 방법 (복사해서 쓰기)
Supabase 대시보드 → 프로젝트 winter-partner → **SQL Editor**에서 아래를 붙여 넣고 Run. 모두 `select`(읽기)뿐이라 데이터를 바꾸지 않는다. 다섯 개를 한 번에 붙여 넣으면 마지막 결과만 보이므로 **하나씩** 실행한다.

**① 최근 실행 3회 — 돌았는지, 성공했는지, 건수**
```sql
select created_at at time zone 'Asia/Seoul' as kst, ok,
       case when ok and pg_input_is_valid(detail, 'jsonb') then detail::jsonb -> 'anonymizedCustomers' end as anonymized_customers,
       case when ok and pg_input_is_valid(detail, 'jsonb') then detail::jsonb -> 'purgedAccessLogs' end as purged_access_logs,
       case when ok and pg_input_is_valid(detail, 'jsonb') then detail::jsonb -> 'purgedConsult' end as purged_consult,
       case when ok and pg_input_is_valid(detail, 'jsonb') then detail::jsonb -> 'instagramTokens' end as instagram_tokens,
       case when not ok then detail
            when not pg_input_is_valid(detail, 'jsonb') then '기록 잘림 — 전체 결과는 Vercel 로그 "cron maintenance/daily"' end as error
from ops_events
where kind = 'cron_run' and source = '/api/maintenance/daily'
order by created_at desc
limit 3;
```

**② 정리 뒤에도 남은 90일 지난 상담 (정리가 제대로 됐다면 모두 0)**
```sql
select
  (select count(*) from conversations c
    where greatest(c.created_at, coalesce(c.last_customer_message_at, c.created_at),
                   coalesce((select max(m.sent_at) from messages m where m.conversation_id = c.id), c.created_at))
          < now() - interval '90 days')                                   as old_conversations,
  (select count(*) from messages where sent_at < now() - interval '90 days') as old_messages;
```

**③ 강습 등록으로 넘긴 문의는 연락처가 지워졌는지 (대화 연결이 끊긴 converted 문의에 연락처·초안이 남아 있으면 안 됨 → 0)**
```sql
select count(*) as kept_inquiries_with_contact
from inquiries
where status = 'converted' and conversation_id is null
  and (contact_enc is not null or ai_draft is not null);
```

**④ 손님 익명화·접속 기록 (참고용 숫자)**
```sql
select
  (select count(*) from customers where anonymized_at >= now() - interval '1 day') as anonymized_last_24h,
  (select count(*) from access_logs where created_at < now() - interval '2 years')  as access_logs_over_2y;
```

**⑤ 정리 시각 앞뒤 서버 오류**
```sql
select created_at at time zone 'Asia/Seoul' as kst, source, left(detail, 200) as detail
from ops_events
where kind = 'server_error' and created_at > now() - interval '1 day'
order by created_at desc;
```
Vercel 쪽도 한 번: Vercel 대시보드 → winter-partner → **Logs**에서 시간을 03:00 전후로 두고 `daily maintenance failed`를 검색한다(없어야 정상). Settings → Cron Jobs에서 `/api/maintenance/daily`의 마지막 실행이 성공인지도 본다.

**⑥ AI 상담 사용권 정리(P23-2, 2026-11-06 적용) — 정리 작업 결과의 `consultLicenses`와 사용권 표**
```sql
select created_at at time zone 'Asia/Seoul' as kst, ok,
       case when ok and pg_input_is_valid(detail, 'jsonb') then detail::jsonb -> 'consultLicenses' end as consult_licenses_sweep
from ops_events
where kind = 'cron_run' and source = '/api/maintenance/daily'
order by created_at desc
limit 3;
```
```sql
select
  (select count(*) from consult_plans)                                  as plans,
  (select count(*) from consult_plans where code = 'standard_v1' and active) as standard_v1_active,
  (select count(*) from consult_licenses)                               as licenses,
  (select count(*) from consult_licenses where status = 'suspended')    as suspended,
  (select count(*) from consult_usage_packs)                            as packs,
  (select value #>> '{}' from private.app_settings where key = 'consult_license_required') as license_required;
```
정리 작업이 실패하면 ①의 `error` 칸에 `consult_license_sweep` 관련 문장이 나온다(이 작업은 사용권 정리가 실패해도 전체를 실패로 남긴다).

**⑦ public 표 권한(P21-12, 2026-11-06 14:44 적용) — 표별 anon·authenticated 권한 재조회** (SQL 편집기, 읽기 전용)
```sql
with t as (
  select c.relname as tbl,
    concat_ws(',', case when has_table_privilege('anon', c.oid, 'INSERT') then 'I' end,
                   case when has_table_privilege('anon', c.oid, 'UPDATE') then 'U' end,
                   case when has_table_privilege('anon', c.oid, 'DELETE') then 'D' end,
                   case when has_table_privilege('anon', c.oid, 'TRUNCATE') then 'T' end,
                   case when has_table_privilege('anon', c.oid, 'REFERENCES') then 'R' end,
                   case when has_table_privilege('anon', c.oid, 'TRIGGER') then 'G' end) as anon_write,
    concat_ws(',', case when has_table_privilege('authenticated', c.oid, 'TRUNCATE') then 'T' end,
                   case when has_table_privilege('authenticated', c.oid, 'REFERENCES') then 'R' end,
                   case when has_table_privilege('authenticated', c.oid, 'TRIGGER') then 'G' end) as auth_trt,
    concat_ws(',', case when has_table_privilege('authenticated', c.oid, 'SELECT') then 'S' end,
                   case when has_table_privilege('authenticated', c.oid, 'INSERT') then 'I' end,
                   case when has_table_privilege('authenticated', c.oid, 'UPDATE') then 'U' end,
                   case when has_table_privilege('authenticated', c.oid, 'DELETE') then 'D' end) as auth_rw
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
)
select * from t order by (anon_write = '' and auth_trt = ''), tbl;
```

### 정상 기준
**지금(실사용자 0명, 2026-11-08 이후)** — 아래가 모두 맞으면 정상이다.
| 확인 | 정상 |
|---|---|
| ① 03:00 KST 무렵 줄이 있다 | 있음, `ok = true` (11-07 줄만 `error` 칸에 "기록 잘림" — 위 설명) |
| ① `anonymized_customers`·`purged_access_logs` | `0` |
| ① `purged_consult` | `{}` (0인 항목은 빠진다 = 모두 0) |
| ① `instagram_tokens` | `{"skipped": true}`(메타 환경변수 없음) 또는 `{}`(갱신·실패 0) |
| ② `old_conversations`·`old_messages` | `0`, `0` |
| ③ `kept_inquiries_with_contact` | `0` |
| ⑤ 서버 오류 | 0건, Vercel 로그에 `daily maintenance failed` 없음 |
| ⑥ `consult_licenses_sweep` | `{"required": false}` (스위치 꺼짐, 나머지 건수 0이라 빠짐) |
| ⑥ 사용권 표 | `plans` 1, `standard_v1_active` 1, `licenses` 0, `suspended` 0, `packs` 0, `license_required` `false` (본사가 사용권을 부여하기 전) |
| ⑦ 표 권한 | 52줄(표 수). **모든 줄의 `anon_write`·`auth_trt`가 빈칸**. `auth_rw`는 2026-11-06 적용 직후와 같다(전체 표 기준 SELECT 49·INSERT 45·UPDATE 43·DELETE 44. `auth_rw`가 빈칸인 3줄 consult_licenses·conversations·shop_channels는 열 단위 권한이거나 서버 전용이라 정상). 빈칸이 아닌 줄이 있으면 맨 위에 모여 보인다 |

즉 **대상 0건, 오류 0건이면 정상**이다(운영 상담 표는 2026-11-05에 만들어져 실제로 지울 대상은 2027-02 이후에 처음 생긴다).

**실사용자가 생긴 뒤** — 매주 한 번(또는 숫자가 튈 때) 본다.
| 확인 | 정상 |
|---|---|
| ① 매일 03:00 무렵 줄이 하루 1개씩, 모두 `ok = true` | 빠진 날·실패 0 |
| ① `purged_consult` 숫자 | 90일 전 그날 들어온 상담 양과 비슷한 수준. 갑자기 평소의 몇 배면 의심(시계·기준 오류) |
| ① `inquiries_kept` | 90일 전 강습 등록으로 넘긴 문의 수와 비슷. `inquiries_deleted`보다 크면 이상 |
| ② 실행 직후 | 언제나 `0`, `0` (매일 지우므로 하루치 이상 쌓이면 안 됨) |
| ③ | 언제나 `0` |
| ④ `anonymized_last_24h` | 시즌이 바뀌는 시점(보존 3시즌이 끝나는 손님)에만 몰려서 생긴다. 시즌 중 매일 큰 숫자면 이상 |
| ⑤ | 정리 작업 관련 오류 0 |
| ⑥ | `required`가 스위치 값과 같다. 스위치가 true면 `suspended`·`expiry_notices`는 본사 사용권 표의 "끝남"·"3일 안에 끝남" 샵 수와 맞아야 한다. 사용권 수는 본사가 부여한 수와 같다 |

### 이상할 때
| 증상 | 할 일 |
|---|---|
| ①에 그날 줄이 없음 | 크론이 안 돌았다. Vercel → Settings → Cron Jobs에서 실행 이력·오류 확인, `CRON_SECRET` 환경변수가 있는지(이름만) 확인. 직접 다시 돌리지 말고(다른 정리까지 같이 돈다) Claude Code에 "정리 작업 안 돎"으로 알린다 |
| ① `ok = false` | `error` 칸 문장 그대로 Claude Code에 전달. 예: `function public.purge_consult_data() does not exist` → 마이그레이션 미적용(`docs/pending-migrations.md` 확인). 다음 날 03:00에 자동으로 다시 돈다 |
| ② 0이 아님 | 정리가 덜 됐다. 다음 실행 뒤에도 남아 있으면 Claude Code에 숫자와 함께 알린다(행 내용은 보내지 않는다) |
| ③ 0이 아님 | **개인정보 사고 후보.** 연락처가 남은 문의가 있다는 뜻이므로 바로 Claude Code에 알리고, 그 사이 손님에게 새 연락은 하지 않는다 |
| ⑥ `license_required`가 `true`인데 켠 적이 없음 | 누가 바꿨는지 Claude Code에 알린다(되돌리기: `docs/ai-consult/pilot-license-runbook.md`의 false SQL). 사용권 없는 샵은 모두 AI 상담이 꺼진다 |
| ⑦ `anon_write`나 `auth_trt`가 빈칸이 아닌 표가 있음 | 그 표 이름만 Claude Code에 알린다. 새 마이그레이션이 회수 문장을 빠뜨렸거나(CI `table_grants` 테스트가 원래 막는다) 누가 대시보드에서 권한을 줬다는 뜻이다. 되돌리지 말고 기다린다(데이터는 RLS가 계속 막는다) |
| ① 숫자가 비정상적으로 큼 | 잘못 지웠을 수 있다. 정리는 되돌릴 수 없으므로 **다음 03:00 전에** Claude Code에 알려 크론을 멈출지 정한다(크론 끄기는 Vercel 설정이라 사장님이 한다). Pro 요금제라면 백업 시점도 함께 확인 |
