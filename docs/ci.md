# CI와 풀 리퀘스트 흐름 (P20)

변경은 풀 리퀘스트를 거쳐 main으로 들어간다. **main 병합 = Vercel 운영 배포**다. CI는 GitHub 서버 안에 **임시 로컬 Supabase**를 띄워 거기에만 붙고, 운영 DB·운영 키는 쓰지 않는다(저장소 Secrets도 쓰지 않는다). 실제 AI 호출도 없다(`AI_MOCK=1`, 키 없음).

## 워크플로

| 파일 | 언제 | 작업(상태 점검 이름) | 하는 일 |
|---|---|---|---|
| `security.yml` | PR, main 푸시 | **security** | 보안 점검(비밀값·RLS·service role·npm audit), 린트, 타입, gitleaks |
| `ci.yml` | PR, main 푸시 | **unit** | `npm ci` → `npm test` (vitest) |
| | | **db** | Supabase CLI → `supabase start`(DB에 필요한 것만) → `supabase db reset`(빈 DB에 마이그레이션 전부 + 시드) → `supabase test db`(pgTAP 전체). 마이그레이션이 처음부터 깨끗이 적용되는지 검증을 겸한다 |
| | | **e2e-core** | 로컬 Supabase + `next build` → `next start` → Playwright 핵심 세트(리허설·시즌 제외). 실패하면 리포트·스크린샷·trace를 artifact `e2e-core-report`로 14일 보관 |
| `e2e-full.yml` | main 푸시, 매일 03:00 KST, 수동 | e2e-full | Playwright 전체(리허설·시즌 포함). 실패하면 이슈 "전체 E2E 실패 (main·야간)" |
| `migration-pr.yml` | PR | migration-check | 마이그레이션이 바뀐 PR이면 되돌리기 메모·`docs/pending-migrations.md` 등록 확인(없으면 실패), `migration-pending` 라벨·안내 댓글 |
| `post-deploy.yml` | Vercel 운영 배포 완료(deployment_status) | check-prod | 읽기 전용 `check:prod`(GET만, 로그인 없음). 실패하면 이슈 "운영 배포 뒤 점검 실패" |

공통: `permissions: contents: read`(이슈·라벨 쓰는 작업만 그 권한을 따로), 작업별 `timeout-minutes`, 같은 PR의 이전 실행은 새 푸시가 오면 취소(`concurrency`).

**핵심 세트와 전체를 나눈 이유**: 리허설(`rehearsal.spec.ts`)·시즌(`season.spec.ts`)은 한 파일 안에서 단계가 이어지는 종합 시나리오라 가장 오래 걸리고(로컬 운영 빌드 기준 E2E 시간의 45%), 하나가 실패하면 뒤 단계가 모두 멈춘다. PR에서는 나머지 기능별 테스트를 필수로 돌리고, 종합 시나리오는 main 병합 직후·매일 밤에 돌려 이슈로 알린다. 나누는 기준은 `playwright.config.ts`의 `SLOW_SPECS`.

## 로컬에서 CI와 같게 돌리기

```bash
npm test                                         # unit
npx supabase db reset --local && npx supabase test db   # db
E2E_SERVER=start E2E_SET=core npx playwright test       # e2e-core (운영 빌드)
E2E_SERVER=start npx playwright test                    # e2e-full
```
기본 `npx playwright test`는 개발 서버(`next dev`)로 돈다(경로 예열 포함, 약 15분).

## 시간과 비용

| 측정 | 핵심 세트 | 전체 |
|---|---|---|
| 로컬 Mac, 운영 빌드(빌드 포함) | 46개 2.8분 | 60개 4.1분 |
| 로컬 Mac, 개발 서버 | — | 약 15분 |
| GitHub CI (PR #1 첫 실행) | e2e-core 5분 0초 | e2e-full: main 병합 뒤 측정 |

- **비용**: 저장소가 공개(public)라 GitHub 표준 러너(ubuntu-latest) 사용은 무료·무제한이다([GitHub 문서](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [2026 요금 변경 안내](https://github.com/resources/insights/2026-pricing-changes-for-github-actions)). 저장소를 비공개로 바꾸면 무료 요금제 월 2,000분 안에서 쓰게 되니, 그때 이 표의 시간으로 다시 계산한다.
- 15분 기준: 전체가 15분을 넘으면 e2e를 샤딩(`--shard=1/2`)하거나 핵심 세트에서 더 뺀다.

### CI 실측 (PR #1, 2026-11-03, ubuntu-latest)

| 작업 | 시간 | 결과 |
|---|---|---|
| security | 1분 3초 | 통과 |
| unit | 1분 14초 | 통과 (256) |
| db | 1분 35초 | 통과 (pgTAP 522, 빈 DB에 마이그레이션 전부) |
| e2e-core | 5분 0초 | 통과 (46, npm ci·Supabase 시작·브라우저 설치·빌드 포함) |
| migration-check | 6초 | 통과 (마이그레이션 없음) |

작업이 병렬로 돌아 PR 한 번의 대기 시간은 **약 5분**이다(15분 기준 안). 비용 0원(공개 저장소 표준 러너).

## 풀 리퀘스트 흐름 (Claude Code 작업 방식)
`CLAUDE.md`·`docs/LOOP.md`에 규칙이 있다. 요약:
1. `git checkout -b task/P21-1` (main 최신에서)
2. 로컬에서 같은 명령으로 테스트 → 커밋
3. `git push -u origin task/P21-1` → `gh pr create` (본문은 `.github/pull_request_template.md`)
4. `gh pr checks --watch` → 모두 통과
5. `gh pr merge --squash --delete-branch` → `git checkout main && git pull`

마이그레이션이 있으면 `docs/pending-migrations.md`에 추가(CI가 확인). 원격 적용은 병합 후 사장님 승인. **화면 코드가 새 표·열을 읽으면 병합이 곧 배포라서, 병합 전에 원격 적용 순서를 사장님과 정한다.**

## 사장님이 켤 설정 (제가 대신 바꾸지 않습니다)

### 1. GitHub 토큰 권한
지금 `gh`가 쓰는 계정(pod1412)의 토큰에는 `repo`·`workflow` 권한이 있어 워크플로 푸시와 PR 생성·병합이 됩니다. 저장소 관리자(admin) 권한은 없어서 브랜치 보호는 사장님 계정(Barumix-Joshep)으로 켜야 합니다. 나중에 세분화 토큰(fine-grained)으로 바꾸면 **Contents·Pull requests·Workflows: Read and write, Issues: Read and write**가 필요합니다.

### 2. 브랜치 보호 (main)
GitHub 저장소 → **Settings → Rules → Rulesets → New ruleset → New branch ruleset** (또는 Settings → Branches → Add branch protection rule):
1. 이름 `main 보호`, Enforcement status **Active**, Target branches → **Include default branch**.
2. **Restrict deletions**, **Block force pushes** 켜기.
3. **Require a pull request before merging** 켜기 — Required approvals는 **0**(혼자 운영이라 승인자 없이 병합. 다른 사람이 생기면 1로).
4. **Require status checks to pass** 켜기 → **Require branches to be up to date before merging** 켜기 → Add checks에서 `security`, `unit`, `db`, `e2e-core` 추가(목록에 안 보이면 첫 PR의 CI가 한 번 돈 뒤 다시 찾기). `migration-check`는 마이그레이션 PR에만 뜨므로 필수에 넣지 않는다(실패하면 PR 화면에 빨간 X로 보임).
5. (선택) **Require linear history** — squash 병합만 쓰므로 켜도 된다.
6. Bypass list는 비워 둔다(관리자도 PR로).
7. Save. 확인: main에 직접 푸시하면 거절되는지(저에게 알려 주시면 확인합니다).

저장소 Settings → General → Pull Requests에서 **Allow squash merging만** 켜고 **Automatically delete head branches**를 켜면 정리가 쉽습니다.

### 3. 스테이징·미리보기
`docs/staging-plan.md` 결정 (추천: 미리보기 Preview 변수 삭제).

## 운영 확인 (자동·수동)
- **자동**: 운영 배포가 끝나면 `post-deploy`가 `check:prod`(읽기 전용)를 돌리고 실패하면 이슈를 남긴다. Vercel GitHub 연동이 배포 상태(deployment_status)를 저장소에 보내야 한다(기본 켜짐).
- **수동 — 로그인이 필요한 운영 E2E** (비밀번호가 필요해 자동화하지 않음):
  ```bash
  npm run check:prod                 # 읽기 전용
  npm run e2e:prod                   # [테스트] 계정 로그인, .env.local + .env.rehearsal.local 필요. 실제 AI를 부르는 테스트가 있어 횟수 상한을 지킨다
  node --env-file=.env.local --env-file=.env.rehearsal.local scripts/rehearsal/prod-smoke.mjs   # SMOKE_MAX_AI=0이면 AI 없이 화면만
  ```
  큰 배포(마이그레이션 적용 직후 등) 뒤에 사람이 한 번 돌린다.

## 마이그레이션 원격 적용 (자동화하지 않음)
1. 병합된 마이그레이션은 `docs/pending-migrations.md` 대기 목록에 있다.
2. 승인 요청 전: `node scripts/ops/migration-preflight.mjs` → 대기 파일별 새 표·바뀌는 표·함수·지금 바뀌는 데이터·되돌리기 메모·사전 백업 필요 여부 표. 제약 추가가 있으면 운영 위반 행 수를 읽기 조회로 센다.
3. 데이터가 바뀌는 마이그레이션은 `bash scripts/ops/db-backup.sh` 먼저(`docs/rollback.md`).
4. 사장님 승인 → `npx supabase db push --linked` → check:prod·스모크 → 대기 목록에서 지우고 적용 기록에 남긴다.
