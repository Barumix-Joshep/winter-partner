# 도메인 전환: winter-partner.vercel.app → winter-partner.co.kr (P24-1)

서비스 주소를 `https://winter-partner.co.kr`로 바꾸는 준비 문서입니다. DNS는 후이즈(whois.co.kr)에서 관리하고, 메일 발송은 `mail.winter-partner.co.kr`(Resend)로 합니다.

**운영 설정은 아무것도 바꾸지 않았습니다.** Vercel·Supabase·DNS·Resend·메타·카카오·GitHub 설정은 그대로입니다. 이 PR은 코드가 주소를 설정 하나(`SITE_URL`)로 따르게 하고, 점검 스크립트 주소를 바꿀 수 있게 한 것뿐입니다. 기본값은 계속 vercel.app입니다.

작성: 2026-11-07

## 1. 원칙

- **vercel.app은 끄지 않습니다.** 새 도메인을 붙여도 `winter-partner.vercel.app`은 Vercel이 계속 살려 둡니다. 이미 보낸 링크·인쇄한 QR·샵이 등록한 카카오 스킬 주소가 그대로 동작합니다. 그래서 되돌리기가 쉽습니다.
- 대표 주소는 `winter-partner.co.kr`(www 없음)로 하고, `www.winter-partner.co.kr`은 대표 주소로 넘깁니다(Vercel 기본 권장). 로그인 쿠키가 주소마다 따로라 두 주소를 다 쓰면 로그인이 두 번 필요해집니다.
- 순서: 새 주소가 열리는지 먼저 확인 → 로그인 메일 → 공유 링크(`SITE_URL`) → 외부 연동(메타·카카오) → 문서·점검 기본값.

## 2. 지금 주소가 쓰이는 곳

"누가"의 사장님 = 외부 화면 설정, Claude Code = 저장소 코드·문서.

| 곳 | 지금 | 전환 때 | 누가 |
|---|---|---|---|
| Vercel → Domains | vercel.app만 | `winter-partner.co.kr`, `www.winter-partner.co.kr` 추가 | 사장님 |
| 후이즈 DNS | (없음) | 루트·www를 Vercel로, mail 하위 도메인을 Resend로 | 사장님 |
| 공유 링크: 동의 링크·셀프 등록 QR·가입 안내 (`src/lib/origin.ts` `siteOrigin()`) | 요청 주소 | Vercel Production 환경변수 `SITE_URL=https://winter-partner.co.kr` → 이후 링크는 어느 주소로 들어와도 새 주소 | 사장님(값 넣기) |
| 가입 인증·비밀번호 재설정 메일 링크 (`src/app/login/actions.ts`) | 요청 주소(`origin` 헤더) | 코드 그대로. 사용자가 들어온 주소로 돌아옵니다. Supabase 허용 목록에 두 주소가 다 있어야 합니다 | 사장님(Supabase) |
| Supabase → Auth → URL Configuration | Site URL `https://winter-partner.vercel.app`, Redirect URL `…vercel.app/auth/confirm` 하나 | Site URL을 새 주소로, Redirect URL에 `https://winter-partner.co.kr/auth/confirm` 추가(옛 줄은 남김) | 사장님 |
| Supabase → Auth → SMTP 보낸 사람 | 내장 메일 | `no-reply@mail.winter-partner.co.kr` (docs/mail-setup.md) | 사장님 |
| 인스타 OAuth 리디렉션 URI (`/api/channels/instagram/connect`·`callback`) | 요청 주소 | 코드 그대로(`requestOrigin()`, 로그인·nonce 쿠키가 주소별이라). 메타 앱에 새 주소 URI를 **추가**(옛 줄은 남김) | 사장님(메타) |
| 인스타 웹훅 콜백 URL | `…vercel.app/api/webhooks/instagram` | 새 주소로 교체(앱당 하나). 옛 주소도 계속 받으므로 급하지 않음 | 사장님(메타) |
| 메타 앱 정보: 홈페이지·처리방침·약관·데이터 삭제 URL (docs/meta-setup.md) | vercel.app | 새 주소 | 사장님(메타) |
| 카카오 챗봇 스킬 URL `…/api/webhooks/kakao/<토큰>` | 샵마다 오픈빌더에 등록 | 새 샵은 새 주소로 안내. 이미 등록한 샵은 그대로 둬도 동작 | 사장님·샵 |
| 카카오 개발자 앱(카카오 로그인, P2-1K) 사이트 도메인 | 아직 없음 | 만들 때 새 주소로 등록. Redirect URI는 Supabase 주소라 바뀌지 않음 | 사장님 |
| 웹푸시 VAPID 연락처 (`src/lib/notify/dispatch.ts`) | 운영 `VAPID_SUBJECT`(mailto, 회사 메일) | 바꿀 필요 없음. 없을 때만 `SITE_URL` → vercel.app 순으로 씀. **VAPID 키는 절대 바꾸지 않음** | — |
| 배포 뒤 자동 점검 (`.github/workflows/post-deploy.yml`) | vercel.app | GitHub 저장소 변수(Variables, 비밀값 아님) `PROD_URL=https://winter-partner.co.kr` | 사장님 |
| `npm run check:prod`·`e2e:prod`·`scripts/rehearsal/prod-smoke.mjs` | vercel.app | `PROD_URL` 환경변수로 바꿀 수 있음. 전환 확인 뒤 기본값 교체 PR | Claude Code |
| 문서 속 주소 (kakao-setup·meta-setup·mail-setup·ops-check·owner-todo·pilot-onboarding·pilot-device-check) | vercel.app | 전환 확인 뒤 새 주소로 고치는 PR | Claude Code |
| 화면·약관·처리방침·매니페스트·메타데이터 | 주소 없음(상대 경로) | 바꿀 것 없음 | — |
| 쿠키 (`src/lib/supabase/cookie-options.ts`) | domain 지정 없음(주소별) | 그대로. 새 주소에서 다시 로그인 | — |
| 보안 헤더 CSP (`next.config.ts`) | `'self'` + Supabase | 그대로 | — |
| 정기 작업 (`vercel.json` crons) | 경로만 | 그대로 | — |
| 로컬 Supabase (`supabase/config.toml`) | localhost만 | 그대로 | — |

## 3. 전환 순서 (체크리스트)

각 단계가 끝나면 저에게 "○단계 끝"이라고만 알려 주세요. 비밀값은 문서·대화에 붙여 넣지 않습니다.

### 0. 하루 전
- [ ] 후이즈 → 도메인 관리 → `winter-partner.co.kr`이 **후이즈 네임서버**를 쓰는지 확인(그래야 후이즈 DNS 화면에서 레코드를 넣을 수 있습니다).
- [ ] 이미 있는 레코드(회사 메일 MX 등)가 있으면 화면을 캡처해 둡니다. 루트(@)·www·mail 외에는 건드리지 않습니다.
- [ ] CAA 레코드가 있다면 Vercel 인증서 발급처(Let's Encrypt)를 허용하는지 봅니다. 없으면 그대로 둡니다.

### 1. Vercel에 도메인 추가 (사장님, 10분)
- [ ] Vercel → 프로젝트 winter-partner → **Settings → Domains → Add** → `winter-partner.co.kr` 입력. www도 함께 추가하고 **www → winter-partner.co.kr 로 Redirect**(Vercel이 권하는 기본 선택)로 둡니다.
- [ ] 화면에 "Invalid Configuration"과 함께 넣을 DNS 값이 나옵니다. 보통 루트는 **A 레코드**, www는 **CNAME 레코드**입니다. **값(IP·주소)은 반드시 그 화면에 나온 것을 그대로 복사**합니다(이 문서에 적지 않는 이유: 프로젝트마다 다를 수 있습니다).
- [ ] 이 단계에서는 Production 도메인이 바뀌지 않습니다. vercel.app은 그대로 열립니다.

### 2. 후이즈 DNS 레코드 (사장님, 10분 + 반영 대기 몇 분~몇 시간)
후이즈 → 도메인 관리 → DNS 관리(레코드 관리) 화면에서:

| 종류 | 이름(호스트) | 값 | 하는 일 |
|---|---|---|---|
| A | `@` (비움 또는 루트) | Vercel 화면의 IP | 대표 주소 → Vercel |
| CNAME | `www` | Vercel 화면의 주소 | www → Vercel (Vercel이 대표 주소로 넘김) |

- [ ] 저장 후 Vercel Domains 화면에서 두 줄이 모두 **Valid Configuration**, 인증서(SSL)가 발급될 때까지 기다립니다.
- [ ] 휴대폰 데이터망과 와이파이에서 `https://winter-partner.co.kr` 열기 → 로그인 화면이 나오면 성공. `https://www.winter-partner.co.kr`은 대표 주소로 넘어가야 합니다.

### 3. 메일 발송 도메인 (사장님, 1~2와 따로 언제든)
docs/mail-setup.md를 그대로 따르고, `<회사도메인>` 자리에 `winter-partner.co.kr`을 넣습니다.
- [ ] Resend → Domains → Add Domain → `mail.winter-partner.co.kr`.
- [ ] Resend 화면에 나온 레코드를 후이즈에 그대로 넣습니다. 보통 SPF(TXT)·반송용(MX, `send.mail` 같은 이름)·DKIM(TXT, `resend._domainkey.mail`)이고, DMARC(TXT, `_dmarc.mail`, 처음엔 `p=none`)를 더합니다. **이름·값·우선순위는 Resend 화면 그대로.** 후이즈 화면은 호스트에 도메인 뒷부분을 자동으로 붙이니 `send.mail`처럼 앞부분만 넣습니다(넣은 뒤 Resend에서 Verify로 확인).
- [ ] Resend 모든 줄 Verified → Supabase → Authentication → SMTP에 보낸 사람 `no-reply@mail.winter-partner.co.kr`, 이름 `겨울파트너` (API 키는 그 화면에만).

### 4. Supabase 로그인 주소 (사장님, 5분)
Supabase → 프로젝트 winter-partner → Authentication → URL Configuration:
- [ ] **Redirect URLs**에 `https://winter-partner.co.kr/auth/confirm` **추가**. 옛 `https://winter-partner.vercel.app/auth/confirm`은 **지우지 않습니다**(옛 주소로 가입하는 사람·이미 보낸 메일용).
- [ ] **Site URL**을 `https://winter-partner.co.kr`로 바꿉니다. (메일 문구에 `{{ .SiteURL }}`을 쓴 곳이 있으면 그 링크도 새 주소가 됩니다. 기본 링크 `{{ .ConfirmationURL }}`은 코드가 정한 주소를 씁니다.)

### 5. Vercel 환경변수 (사장님, 5분)
- [ ] Vercel → Settings → Environment Variables → **Production에만** `SITE_URL` = `https://winter-partner.co.kr` (Preview·Development에는 넣지 않습니다).
- [ ] Deployments → 최신 Production 배포 ⋯ → **Redeploy** (환경변수는 다시 배포해야 적용됩니다).
- [ ] `VAPID_SUBJECT`·`VAPID_PRIVATE_KEY`·`NEXT_PUBLIC_VAPID_PUBLIC_KEY`는 **그대로** 둡니다. 키를 바꾸면 모든 알림 구독이 끊깁니다.

### 6. 메타(인스타그램) 앱 (사장님, 10분, 앱이 있을 때만)
docs/meta-setup.md 화면 순서 그대로:
- [ ] Instagram 로그인 설정 → **OAuth 리디렉션 URI**에 `https://winter-partner.co.kr/api/channels/instagram/callback` **추가**(옛 vercel.app 줄은 남김. 샵이 어느 주소에서 연결을 눌러도 되게).
- [ ] 웹훅 **콜백 URL**을 `https://winter-partner.co.kr/api/webhooks/instagram`로 바꾸고, 확인 토큰은 기존 값 그대로 → 확인(Verify) 통과.
- [ ] 앱 정보의 홈페이지·개인정보 처리방침·약관·데이터 삭제 URL을 새 주소로(`/privacy`, `/terms`).

### 7. 카카오 (사장님, 필요할 때)
- [ ] 새로 연결하는 샵의 오픈빌더 스킬 URL은 `https://winter-partner.co.kr/api/webhooks/kakao/<토큰>`으로 안내합니다. 이미 연결한 샵은 바꾸지 않아도 됩니다(옛 주소도 동작). 바꾸고 싶으면 샵 오픈빌더 → 스킬 → URL만 고치고 저장·배포.
- [ ] 카카오 로그인(P2-1K) 앱을 만들 때 플랫폼 → Web 사이트 도메인에 `https://winter-partner.co.kr`(필요하면 vercel.app도)을 넣습니다.

### 8. 자동 점검 주소 (사장님, 2분)
- [ ] GitHub 저장소 → Settings → Secrets and variables → Actions → **Variables** 탭 → `PROD_URL` = `https://winter-partner.co.kr`. (비밀값이 아니라 Variables입니다. 없으면 vercel.app을 점검합니다.)

### 9. 마무리 (Claude Code, 8단계 뒤)
- [ ] 스크립트·워크플로 기본값을 새 주소로 바꾸고, 2절 표의 문서 속 주소를 고치는 PR.
- [ ] 진척 대시보드·`docs/tasks.json` P24-1을 done으로.

## 4. 전환 뒤 확인

| 확인 | 방법 | 기대 |
|---|---|---|
| 읽기 전용 점검 | `npm run check:prod -- https://winter-partner.co.kr` (2단계 뒤 바로 가능) | 모두 통과 |
| 옛 주소 | `npm run check:prod` (vercel.app) | 모두 통과(그대로 살아 있음) |
| 로그인 스모크 | `PROD_URL=https://winter-partner.co.kr npm run e2e:prod`, `PROD_URL=https://winter-partner.co.kr node --env-file=.env.local --env-file=.env.rehearsal.local scripts/rehearsal/prod-smoke.mjs` | 통과 |
| 가입 메일 | 새 주소에서 사장님 개인 메일 하나로 가입 → 메일이 **받은편지함**에 오고, 보낸 사람이 `no-reply@mail.winter-partner.co.kr`, 링크가 `winter-partner.co.kr/auth/confirm`으로 돌아오는지 | 가입 완료 |
| 비밀번호 재설정 메일 | 같은 계정으로 재설정 → 링크가 새 주소 `/login/reset`으로 | 새 비밀번호 저장 |
| 공유 링크 | 샵 화면에서 셀프 등록 QR·동의 링크를 만들어 주소 확인. **vercel.app에서 만들어도** `winter-partner.co.kr`로 나와야 함(5단계 효과) | 새 주소 |
| 인스타 연결 | 새 주소에서 샵 → AI 상담 → 인스타그램 연결 → 돌아오기 | "연결됨" |
| 인스타 웹훅 | 메타 화면 Verify 통과 + 테스트 DM 1건 | 상담함에 도착 |
| 알림 | 새 주소에서 알림 허용 → 테스트 알림 | 도착 |
| 배포 뒤 자동 점검 | 다음 main 병합 뒤 post-deploy 실행 로그의 주소 | 새 주소 |

## 5. 되돌리기

vercel.app이 계속 살아 있으므로 대부분 설정 하나를 되돌리면 됩니다.

| 문제 | 되돌리기 |
|---|---|
| 공유 링크가 이상함 | Vercel `SITE_URL` 삭제 → Redeploy (요청 주소로 돌아감) |
| 메일 링크가 안 돌아옴 | Supabase Site URL을 vercel.app으로. Redirect URL 두 줄은 그대로 |
| 새 주소가 안 열림 | 사람들에게 vercel.app 안내. 후이즈 레코드·Vercel Domains 확인 |
| 인스타 연결·웹훅 실패 | 메타 웹훅 콜백 URL을 vercel.app으로(리디렉션 URI는 두 줄이라 그대로) |
| 자동 점검 실패 | GitHub 변수 `PROD_URL` 삭제 |
| 코드 문제 | docs/rollback.md 코드 롤백 |

## 6. 위험과 영향

- **다시 로그인**: 로그인 쿠키는 주소별입니다. 새 주소로 처음 오면 모두 한 번 로그인해야 합니다. 시범 샵·강사에게 미리 알립니다.
- **홈 화면 앱(PWA)**: 설치도 주소별입니다. vercel.app으로 설치한 아이콘은 계속 vercel.app을 엽니다. 새 주소로 옮기려면 새 주소에서 다시 "홈 화면에 추가"하고 옛 아이콘을 지웁니다.
- **알림 구독**: 알림 허용도 주소별입니다. 새 주소에서 다시 허용해야 합니다. 두 주소에서 다 허용하면 같은 알림이 두 번 올 수 있습니다(옛 아이콘을 지우고 옛 주소의 알림을 끄면 해결). VAPID 키를 바꾸지 않으므로 기존 구독이 끊기지는 않습니다.
- **이미 나간 링크·인쇄한 QR**: 동의 링크·셀프 등록 QR·카카오 스킬 주소는 vercel.app 그대로 동작합니다. 인쇄물은 다음 인쇄 때 새 주소로 다시 만듭니다.
- **HSTS**: 운영 응답에 `Strict-Transport-Security: includeSubDomains`가 있어, 새 주소로 한 번 접속한 브라우저는 `*.winter-partner.co.kr` 하위 주소를 모두 https로만 엽니다. `mail.` 같은 하위 도메인에 http 전용 웹페이지를 두지 않는 한 문제없습니다.
- **DNS 실수**: 루트·www·mail 외 레코드(회사 메일 등)를 지우면 그 서비스가 멈춥니다. 0단계 캡처를 남깁니다.
- **Preview 배포**: `SITE_URL`은 Production에만 넣으므로 미리보기는 지금처럼 요청 주소를 씁니다.

## 7. 사장님께 여쭐 것

1. 대표 주소를 `winter-partner.co.kr`(www 없음)로 할까요, `www.`로 할까요? (이 문서는 www 없음 기준)
2. 나중에 vercel.app 화면 접속을 새 주소로 자동으로 넘길까요? 넘기면 로그인이 한 번 풀립니다. 웹훅(카카오·인스타)·메일 링크 경로는 넘기지 않고 남겨야 해서 코드 작업이 따로 필요합니다. 시범 시즌 동안은 넘기지 않는 것을 권합니다.
3. 회사 메일(예: 문의 주소)도 `winter-partner.co.kr`로 만드실 계획인가요? 그러면 루트 MX 레코드가 생기므로 처리방침의 연락처·VAPID 연락처를 그 주소로 바꿀지 정합니다.
4. 전환 날짜: 시범 샵 온보딩(P10-1) 전에 하면 다시 로그인·재설치 안내가 필요 없습니다. 온보딩 전 전환을 권합니다.
5. 메타 앱 심사 중에 처리방침·홈페이지 URL을 바꿔도 되는지(재심사 여부)는 확인 필요입니다. 심사 중이면 심사가 끝난 뒤 바꾸는 편이 안전합니다.
