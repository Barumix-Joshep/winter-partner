# 미리보기 배포와 스테이징 방안 (P20-3)

설정은 바꾸지 않고 방안만 정리했다. Vercel·Supabase 설정 변경은 사장님이 결정한 뒤에 한다.

## 지금 상태 (2026-11-03, 이름만 조회 — 값은 보지 않음)

`vercel env ls` 결과(이름·환경):

| 변수 | Production | Preview | Development |
|---|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | 있음 | **있음** | — |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | 있음 | **있음** | — |
| NEXT_PUBLIC_VAPID_PUBLIC_KEY | 있음 | 있음 | — |
| SUPABASE_SERVICE_ROLE_KEY | 있음 | 없음 | — |
| ANTHROPIC_API_KEY | 있음 | 없음 | — |
| VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET | 있음 | 없음 | — |

**위험**: Supabase 프로젝트가 운영 하나뿐이므로 Preview의 `NEXT_PUBLIC_SUPABASE_URL`·`ANON_KEY`는 **운영 DB**를 가리킨다(값을 보지 않아도 다른 프로젝트가 없으니 그렇다). 그래서 브랜치를 푸시하면 생기는 미리보기 배포는 **검토 전 코드가 운영 DB에 붙은 상태**다.
- 완화된 점: 서비스 키·AI 키·푸시 비밀 키는 Preview에 없다(관리 권한 우회·AI 비용·푸시 발송 없음). 배포별 주소는 Vercel 로그인 보호(`vercel.com/sso-api`로 넘어감)가 걸려 있어 외부인은 열 수 없다.
- 남은 위험: Vercel 팀원이 미리보기에서 로그인하면, 검토 전 코드로 운영 데이터를 RLS 범위 안에서 읽고 쓴다. 마이그레이션이 아직 안 된 브랜치(P19처럼)의 미리보기는 화면이 깨질 뿐 데이터는 바뀌지 않지만, 쓰기 화면을 바꾼 브랜치라면 실데이터에 영향이 갈 수 있다.
- 시범 샵 실데이터가 들어오기 **전에** 아래 중 하나로 정리해야 한다.

## 선택지 비교

요금은 2026-11 기준 Supabase 공개 자료([요금](https://supabase.com/pricing), [청구 FAQ](https://supabase.com/docs/guides/platform/billing-faq), [브랜칭 사용량](https://supabase.com/docs/guides/platform/manage-your-usage/branching)). 결정 전에 다시 확인한다.

| | (a) 별도 스테이징 프로젝트 | (b) Supabase 브랜칭 | (c) 미리보기 끄기 + CI 로컬 E2E |
|---|---|---|---|
| 하는 일 | `winter-partner-staging` 프로젝트를 하나 더 만들어 Preview 환경변수를 거기로 | 풀 리퀘스트마다 Supabase가 임시 DB 브랜치를 만들고 Vercel 미리보기에 자동 연결 | Vercel 미리보기 배포를 끄거나 Preview 변수를 지움. 검증은 CI(GitHub 서버 안 임시 Supabase)만 |
| 요금제 조건 | 무료 요금제: 활성 프로젝트 2개까지(운영 + 스테이징 = 2). Pro면 추가 프로젝트 월 약 10달러 | **Pro 필수** | 없음 |
| 비용 | 무료면 0원(1주 안 쓰면 일시 정지, 다시 켜야 함). Pro 전환 뒤엔 월 약 10달러 | 브랜치 1개 시간당 약 0.0134달러(Micro). 30시간 열린 PR ≈ 0.4달러 + 전송량. 지출 상한에 안 걸림 | 0원 |
| 마이그레이션·시드 | 사람이 `npx supabase db push --project-ref <스테이징>` + 시드 스크립트. 운영과 어긋나기 쉬움 | 브랜치가 저장소의 마이그레이션·`seed.sql`로 자동 생성 | CI가 매번 빈 DB에 전부 적용(이미 됨) |
| 미리보기에서 사람이 눌러 보기 | 가능 (스테이징 데이터) | 가능 (PR별 깨끗한 데이터) | 불가 (로컬에서 `npm run dev`) |
| 운영 DB 위험 | 없음 (변수만 바꾸면) | 없음 | 없음 |
| 관리 부담 | 중간 (스테이징 계정·데이터·키 관리, 일시 정지) | 낮음~중간 (GitHub·Vercel 연동 설정 1회) | 가장 낮음 |
| 인증 메일·리디렉트 URL | 스테이징 프로젝트에 따로 설정 | 브랜치마다 자동이 아님(설정 필요) | 해당 없음 |

환경변수 매트릭스(선택 시):

| 변수 | Production | Preview (a·b) | Development(로컬) |
|---|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL / ANON_KEY | 운영 | (a) 스테이징 / (b) 브랜칭 연동이 자동 주입 | 로컬 Supabase(`npx supabase start`) |
| SUPABASE_SERVICE_ROLE_KEY | 운영 | (a) 스테이징 키 / (b) 자동 / 넣지 않아도 됨 | 로컬 |
| ANTHROPIC_API_KEY | 운영 | 넣지 않음(AI 꺼짐으로 동작) | 선택 |
| VAPID_*, CRON_SECRET | 운영 | 넣지 않음 | 없음 |

## 추천: (c) 지금 바로, 시범이 커지면 (b)

**이유**
- 시범 단계에서 미리보기를 사람이 눌러 볼 일이 거의 없고, 검증은 이번에 만든 CI(빈 DB에 마이그레이션 전부 + pgTAP + 운영 빌드 E2E)가 대신한다.
- 비용 0원, 설정 한 번으로 운영 DB 위험이 바로 없어진다.
- (a)는 무료 프로젝트 2개 한도를 다 쓰고, 1주 미사용 정지·운영과 어긋남 관리가 시범 단계에 부담이다.
- Pro로 전환하면(백업 때문에 추천, `docs/backup-plan.md`) (b)가 PR별 깨끗한 DB를 시간당 과금으로 주므로, 그때 다시 보는 게 낫다.

## 사장님이 결정할 것
1. (a)·(b)·(c) 중 무엇으로 할지 (추천 c).
2. (c)라면 방법: **Preview 환경변수 3개 삭제**(미리보기는 만들어지지만 DB에 못 붙어 로그인 화면에서 멈춤) 또는 **미리보기 배포 자체 끄기**(Vercel 프로젝트 Settings → Git → Ignored Build Step에 `[ "$VERCEL_ENV" != "production" ]` 같은 조건 — 운영만 빌드). 추천은 변수 삭제(설정이 단순하고 되돌리기 쉬움).
3. Supabase Pro 전환 시점(백업 결정과 함께) — 그때 (b) 검토.

## 전환 절차

**(c) 추천안 — Preview 변수 지우기**
1. Vercel → 프로젝트 winter-partner → Settings → Environment Variables.
2. 이름 옆 환경이 **Preview**인 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` 세 줄만 삭제(Production 줄은 그대로).
3. 다음 브랜치 푸시의 미리보기가 로그인 화면에서 "설정 없음"으로 멈추는지 확인(저에게 알려 주시면 확인합니다).
4. 되돌리기: 같은 화면에서 Preview로 다시 추가.

**(b)로 갈 때**
1. Supabase Pro 전환 → 대시보드 Branching 켜기 → GitHub 저장소 연결(마이그레이션 폴더 `supabase/migrations`).
2. Vercel 연동(Supabase Integration)으로 Preview 변수를 브랜치 값으로 자동 주입. 기존 Preview 변수는 삭제.
3. 시드: `supabase/seed.sql`이 테스트용이라 그대로 쓴다([테스트]·010-0000 규칙).
4. 첫 PR에서 브랜치가 생기고 마이그레이션이 깨끗이 적용되는지 확인.

**(a)로 갈 때**
1. Supabase 새 프로젝트(무료, 서울 지역) → `npx supabase db push --project-ref <스테이징>` → 시드 적용.
2. Vercel Preview 변수 3개를 스테이징 값으로 교체(서비스 키는 넣지 않거나 스테이징 것만).
3. 운영 마이그레이션 적용 전에 스테이징에 먼저 적용하는 순서를 `docs/pending-migrations.md`에 추가.
