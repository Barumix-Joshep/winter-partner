# 본사 MFA(P21-3) 설계 메모 — 구현 전, 사장님 결정용

작성 2026-11-07, 같은 날 밤 보완(운영 본사 계정 생성 뒤). **구현하지 않았다.** 결정할 것(아래 1절)이 정해지면 이 메모로 계획(`docs/plans/`)을 쓰고 구현한다.
위험도: 지금 P3(운영 본사 계정 1개, 실데이터 0). 실데이터를 받기 시작하면 P2. 본사 계정 하나로 모든 샵의 손님·강사·정산·상담 기록을 볼 수 있어, 비밀번호 하나만 새도 전부 열린다.

## 1. 사장님이 정할 것 (결정 질문 5개와 추천안)

추천안 그대로면: 본사만, 인증 앱(TOTP), 인증 앱 2대 + 대시보드 복구, 실데이터 전, 로그인마다.

| # | 결정 | 선택지 | 제안 |
|---|---|---|---|
| 1 | 휴대폰을 잃어버렸을 때 복구 | (가) 두 번째 본사 계정(사장님 다른 메일 주소, 평소 쓰지 않음) (나) 인증 앱 2대 등록(예: 휴대폰 + 태블릿) (다) Supabase 대시보드에서 사장님이 인증 요소를 지움(대시보드는 별도 로그인·2단계 인증) | (나)+(다). (다)는 이미 있는 길이라 추가 작업이 없다. Supabase 계정 자체에 2단계 인증을 켜 두는 것이 전제 |
| 2 | 대상 | 본사만 필수 / 샵 관리자는 선택 / 샵 관리자도 필수 | 본사만 필수, 샵 관리자는 이번 범위 밖(다음 시즌 선택 기능) |
| 3 | 방식 | 인증 앱(TOTP, 6자리 코드) / 문자(SMS, 비용·Twilio 등 외부 서비스 필요) / 패스키(WebAuthn) | 인증 앱. 원격 Supabase에서 TOTP가 이미 켜져 있어 외부 서비스 변경이 없다 |
| 4 | 시점 | 시범 전 / 시범 중 / 시즌 뒤 | **실제 손님 개인정보를 받기 전**(시범 샵이 실데이터를 넣기 전). 본사 계정을 만든 직후가 가장 쉽다(등록할 사람이 1명) |
| 5 | 다시 묻는 간격 | 로그인마다 / 기기를 기억(30일) | 로그인마다. Supabase 세션은 로그인 단위라 "기기 기억"은 따로 만들어야 한다(범위 밖) |

## 2. 지금 상태 (코드·설정 조사)

- 원격 Supabase: TOTP 등록·검증이 켜져 있다(P21-3 메모, 2026-11-05 점검). 앱은 쓰지 않는다.
- 로컬 `supabase/config.toml`: `[auth.mfa.totp] enroll_enabled = false`, `verify_enabled = false`. 로컬 시험과 CI를 하려면 이 두 값을 true로 바꿔야 한다. 이 파일은 로컬·CI 전용이다. 원격 설정은 바꾸지 않는다.
- 로그인: `src/app/login/actions.ts`의 `signInWithPassword` 다음에 바로 `redirect`한다. aal(인증 수준)을 보지 않는다.
- 화면 가드: `/admin` 화면·컴포넌트 11곳과 서버 동작 7곳이 `requireArea("admin")`(`src/lib/auth/session.ts`)를 부른다. 이 가드는 `profiles.role`만 본다.
- 데이터 보호: 본사 화면은 **로그인 사용자 권한**(anon 키 + 세션)으로 읽고, RLS·RPC가 `private.is_platform_admin()`으로 본사인지 판단한다.
  - 운영 덤프(2026-11-07) 기준 public 정책 118개 중 36개, public 함수 11개(admin_metric·admin_ops_summary·review_cert·decide_shop_change·set_ai_default 등), storage `certs` 정책이 이 함수를 쓴다.
  - 본사 화면이 service_role로 데이터를 읽는 곳은 없다. service_role은 AI 게이트·운영 기록·웹훅·알림 발송에만 쓴다.
- 세션: 유휴 자동 로그아웃(`src/components/idle-logout.tsx`)이 이미 있다. MFA와 겹치지 않는다.

## 2-1. Supabase TOTP 사용 방식

Supabase Auth의 MFA API(`supabase.auth.mfa.*`)만 쓴다. 비밀 키 저장·코드 검증·세션 등급은 Supabase가 한다. 앱이 TOTP 비밀 키를 DB에 저장하지 않는다.
| 단계 | API | 결과 |
|---|---|---|
| 등록 시작 | `mfa.enroll({ factorType: "totp", friendlyName })` | 인증 요소(상태 `unverified`)와 QR 코드(SVG)·수동 입력 키. 화면에만 보여 주고 서버 로그·DB에 남기지 않는다 |
| 등록 확인 | `mfa.challenge({ factorId })` → `mfa.verify({ factorId, challengeId, code })` | 요소가 `verified`, 세션이 **aal2**로 올라간다(새 토큰) |
| 로그인 뒤 | `mfa.getAuthenticatorAssuranceLevel()` | `currentLevel`(aal1/aal2)·`nextLevel`. verified 요소가 있으면 nextLevel = aal2 |
| 코드 입력 | `mfa.challengeAndVerify({ factorId, code })` | 세션 aal2 |
| 목록·삭제 | `mfa.listFactors()`, `mfa.unenroll({ factorId })` | 요소 삭제는 aal2 세션에서만 된다(Supabase 규칙) |
| DB·RLS | JWT 클레임 `aal`(`auth.jwt() ->> 'aal'`) | 정책·함수가 aal2인지 본다 |

- 원격은 TOTP 등록·검증이 이미 켜져 있다. 로컬·CI는 `supabase/config.toml`의 두 줄만 켠다(외부 설정 변경 없음).
- 인증 앱: Google Authenticator, Microsoft Authenticator, 1Password 등 TOTP 표준 앱이면 된다. 30초마다 바뀌는 6자리 코드.
- 비밀번호 재설정·이메일 링크로 생긴 세션도 aal1이다. 본사는 그 뒤에도 코드를 넣어야 본사 화면이 열린다.

## 2-2. 첫 등록 절차 (본사, 한 번)

1. 사장님이 평소처럼 비밀번호로 로그인한다.
2. 본사이고 등록된 인증 앱이 없으면 `/admin/mfa/enroll`로 간다(본사 화면은 아직 안 열림).
3. 화면에 QR 코드가 나온다. 휴대폰 인증 앱으로 찍는다(못 찍으면 수동 입력 키를 넣는다).
4. 인증 앱의 6자리 코드를 넣는다 → 등록 완료, 바로 본사 화면으로 간다.
5. 화면이 "두 번째 기기도 등록하세요"를 권한다(결정 1의 (나)). 태블릿·다른 휴대폰에서 같은 절차를 반복한다. 지금 보이는 QR을 두 기기로 함께 찍는 방식은 쓰지 않는다(요소를 기기별로 따로 둬야 하나를 잃어도 지울 수 있다).
6. 등록 시험이 끝나면 Claude Code가 운영에서 읽기 조회로 `auth.mfa_factors`의 verified 요소 수만 확인한다(값은 보지 않음). 이 확인이 끝나야 aal2 강제 마이그레이션을 적용한다.

## 2-3. 복구 절차 (인증 앱을 잃어버렸을 때)

| 상황 | 푸는 방법 | 누가 |
|---|---|---|
| 기기 2대 중 1대 분실 | 남은 기기로 로그인 → 설정에서 잃어버린 기기의 요소 삭제 → 새 기기 등록 | 사장님, 화면에서 |
| 등록한 기기를 모두 분실 | Supabase 대시보드(Authentication → Users → 그 사용자 → MFA factors, 메뉴 이름은 대시보드 버전에 따라 다를 수 있음)에서 요소를 지운다 → 다음 로그인 때 첫 등록 절차를 다시 한다 | 사장님, 대시보드(Supabase 계정 로그인 + Supabase 계정 2단계 인증) |
| 대시보드도 못 들어감 | Supabase 계정 복구(Supabase 지원). 이 경우는 앱이 풀 수 없다 | 사장님 |
| 비밀번호까지 잊음 | 비밀번호 재설정 메일(메일 설정 필요) → 그래도 코드 단계가 남는다 | 사장님 |

- 앱 안에 "복구 코드"를 따로 만들지 않는다(Supabase가 복구 코드를 주지 않아 직접 만들면 저장·검증 코드를 새로 써야 한다). 결정 1에서 (가) 두 번째 본사 계정을 고르면 그 계정도 같은 MFA를 등록한다.
- 복구 순서를 `docs/owner-todo.md`와 `docs/rollback.md`에 적는다(구현 PR에서).

## 3. 범위 (결정 1~4가 제안대로일 때) — 본사만 필수

### 화면(새로 만듦)
1. `/admin/mfa/enroll` — 처음 한 번. "인증 앱 등록" → `supabase.auth.mfa.enroll({ factorType: "totp" })`이 돌려준 QR 코드와 수동 입력 키를 보여 주고, 앱의 6자리 코드를 받아 `challenge` → `verify`. 끝나면 세션이 aal2가 된다. 두 번째 기기 등록 버튼(결정 1 (나)).
2. `/login/mfa` — 로그인 뒤 6자리 코드 입력. `challengeAndVerify`. 실패 횟수는 기존 로그인 제한(`src/lib/ops/rate-limit.ts`)에 `mfa_account` 키로 센다(10분 10번).
3. 본사 설정 화면에 "등록된 인증 앱" 목록과 삭제(마지막 1개는 지울 수 없음).

### 로그인 흐름 변경점
| 지금 | 바뀐 뒤 |
|---|---|
| 비밀번호 로그인 → 첫 화면(`/admin`) | 비밀번호 로그인 → `getAuthenticatorAssuranceLevel()`로 확인 → 본사이고 aal1이면: 등록된 인증 앱이 있으면 `/login/mfa`, 없으면 `/admin/mfa/enroll` → aal2가 되면 `/admin` |
| `requireArea("admin")`는 역할만 확인 | 역할 + JWT `aal` 클레임이 `aal2`인지 확인. aal1이면 위 두 화면으로 보낸다(`src/lib/auth/session.ts`, `routing.ts`에 순수 함수로 넣고 단위 테스트) |
| 샵·강사 로그인 | **바뀌지 않음** |
| 비밀번호 재설정 링크 | 재설정 뒤 세션은 aal1이다. 본사는 재설정 뒤에도 코드 입력을 거친다(재설정 메일만으로 본사 화면이 열리지 않는다) |

### DB(마이그레이션 1개, 작음)
- `private.is_platform_admin()`에 `and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'` 조건을 더한다. 함수 하나를 바꾸면 위 정책 36개·RPC 11개·storage 정책이 한꺼번에 aal2를 요구한다. 화면 가드를 우회해 REST로 직접 불러도 aal1 본사 세션은 아무것도 못 본다.
- 함수 이름·인자·권한(P21-13 재부여 목록)은 그대로라 다른 정책은 바뀌지 않는다. 데이터 변경 0.
- 주의: 본사 알림 받는 사람을 찾는 질의(`role = 'platform_admin'` 직접 비교 2곳)는 "누가 본사인가"를 묻는 것이라 그대로 둔다.
- 되돌리기: 함수를 원래 본문으로 다시 만든다(머리 주석에 적음).
- 적용 순서(중요): **본사 계정이 인증 앱을 등록한 뒤** 원격 적용한다. 먼저 적용하면 aal1 본사 세션이 본사 데이터를 못 읽는다. 등록 화면은 본사 데이터를 읽지 않으므로 aal1에서도 열린다.

### 테스트
- pgTAP: `request.jwt.claims`에 `aal: aal1`/`aal2`를 넣어 본사 정책·RPC가 aal1에서 0행·거부, aal2에서 정상인지. 기존 테스트의 본사 클레임에 `aal2`를 더해야 한다(본사를 쓰는 테스트 파일 수정, 지금 본사를 쓰는 pgTAP 파일 10개).
- 단위: 가드 분기(역할 × aal × 인증 앱 유무).
- E2E: 로컬 config에서 TOTP를 켜고, 테스트가 enroll 응답의 비밀 키로 `otplib` 같은 라이브러리로 코드를 만들어 입력(새 개발 의존성 1개). 본사 E2E 시나리오는 로그인 도우미에서 코드 입력까지 하게 바꾼다.
- 운영 스모크(P18-7): 스모크용 본사 계정도 aal2가 필요해진다. 스모크가 TOTP 비밀 키를 읽어야 하므로 `.env.rehearsal.local`에 하나 더 두거나(사장님이 넣음), 스모크 본사 확인을 "로그인 후 `/login/mfa`로 가는지"까지로 줄인다. → 결정 필요(작음).

### 예상 크기
| 부분 | 크기 |
|---|---|
| 마이그레이션 + pgTAP 새 파일 1개 + 기존 테스트 클레임 수정 | 중간(기존 테스트 손질이 대부분) |
| 화면 3개 + 가드·로그인 분기 + 단위 테스트 | 중간(화면 300~450줄) |
| E2E 도우미·시나리오 + 로컬 config 2줄 | 작음~중간 |
| 문서(`docs/owner-todo.md` 등록 방법, `docs/rollback.md`) | 작음 |
| 합계 | PR 2개 권장: ① 화면·가드(마이그레이션 없음, 병합하면 본사가 등록 가능) ② `is_platform_admin` aal2 마이그레이션(본사 등록 확인 뒤 적용). 작업 시간은 하루 안쪽 |

## 4. 바뀌지 않는 것 / 범위 밖
- 원격 Supabase 설정(TOTP는 이미 켜짐). Vercel 환경변수 추가 없음.
- 샵 관리자·강사 로그인, 손님 화면(/join·/consent).
- service_role로 도는 서버 작업(크론·웹훅·AI 게이트): 사용자 세션이 없어 aal과 무관.
- SMS·패스키, 기기 기억.

## 5. 위험과 대응
| 위험 | 대응 |
|---|---|
| 본사가 휴대폰을 잃어 본사 화면에 못 들어감 | 결정 1: 두 번째 인증 앱, 또는 Supabase 대시보드(Authentication → Users → 해당 사용자)에서 인증 요소 삭제 → 다시 등록 |
| 마이그레이션을 등록보다 먼저 적용 | 적용 전 확인 항목에 "본사 계정의 인증 요소 1개 이상(`auth.mfa_factors`의 verified 건수, 읽기 조회)"을 넣는다 |
| 기존 pgTAP에서 본사 클레임에 aal이 없어 대량 실패 | 같은 PR에서 고친다. 테스트를 건너뛰거나 지우지 않는다 |
| 세션 갱신 때 aal이 aal1로 떨어지는지 | Supabase는 갱신한 토큰에도 aal을 유지한다(문서 기준). 구현 때 로컬에서 1시간 갱신을 짧게 해 확인 |
