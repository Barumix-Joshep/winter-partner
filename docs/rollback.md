# 롤백과 사고 대응 (P20-5)

사고가 나면 **먼저 피해를 멈추고(되돌리기), 원인은 그다음**에 본다. 되돌리기 어려운 일(DB 복구·데이터 수정·외부 서비스 설정)은 사장님 확인 뒤에 한다.

## 코드 롤백

**1) 즉시: Vercel 이전 배포로 되돌리기 (1분, DB는 그대로)**
- Vercel → 프로젝트 winter-partner → **Deployments** → 마지막으로 정상이던 Production 배포의 ⋯ → **Instant Rollback**(또는 Promote to Production).
- CLI: `vercel rollback <정상 배포 주소>` (권한 있는 계정).
- 되돌린 뒤 `npm run check:prod`.
- 주의: **이전 코드가 새 DB 구조와 맞는지** 본다. 마이그레이션이 이미 적용됐다면 이전 코드는 새 열을 몰라도 대개 동작하지만, 열·표를 지운 마이그레이션 뒤라면 이전 코드가 깨질 수 있다(그래서 열 삭제는 코드가 먼저 안 쓰게 바꾼 뒤 다음 배포에서 한다).
- Instant Rollback 뒤에는 Vercel이 새 main 푸시를 자동 운영 승격하지 않을 수 있다. 고친 코드가 병합되면 Deployments에서 승격 상태를 확인한다.

**2) 정식: git revert 풀 리퀘스트 (10~20분)**
```bash
git checkout main && git pull
git checkout -b task/revert-<문제 PR 번호>
git revert <squash 병합 커밋>
git push -u origin task/revert-<번호> && gh pr create --title "revert: …" --body "…"
gh pr checks --watch && gh pr merge --squash --delete-branch
```
- CI가 통과해야 병합된다(브랜치 보호). 급하면 1)로 먼저 멈추고 2)는 차분히.

## DB 롤백

**규칙**
- 모든 마이그레이션 머리 주석에 `-- 되돌리기:` 메모를 쓴다(만든 것을 지우는 SQL, 이전 함수 정의가 있는 파일 이름). CI(`migration-pr`)가 확인한다.
- **데이터가 바뀌는 마이그레이션**(update·delete·열/표 삭제, 기존 행을 채우는 것)은 적용 직전 `bash scripts/ops/db-backup.sh`가 **필수**. `node scripts/ops/migration-preflight.mjs`가 "사전 백업 필수"로 표시한다. 구조만 더하는 것(표·열·함수 추가)도 백업 권장.
- 제약(CHECK·고유)을 더하는 마이그레이션은 적용 전에 운영 위반 행 수를 센다(0이어야 한다).

**되돌리는 순서**
1. 사장님께 알리고 승인받는다.
2. 지금 상태를 먼저 백업한다(`db-backup.sh`) — 되돌리다 더 망가질 때를 대비.
3. 구조만 바뀐 경우: 되돌리기 메모의 SQL을 새 마이그레이션 파일(`<시각>_revert_<이름>.sql`)로 만들어 PR → 병합 → 승인 → `npx supabase db push --linked`. 운영 DB에서 SQL을 손으로 실행하지 않는다(기록이 남지 않는다).
4. 데이터가 틀어진 경우: 백업에서 해당 표만 로컬에 복구해 차이를 확인한 뒤, 고치는 SQL을 마이그레이션으로 만든다. 전체 복구(Supabase Pro의 Backups → Restore)는 그 시점 이후 데이터가 모두 사라지므로 최후 수단.
5. 코드가 새 구조를 쓰면 코드 롤백(위)을 먼저 한다.

## 첫 10분 행동 목록

### 알림이 잘못 나갔을 때 (엉뚱한 사람·내용·대량 발송)
1. (0~2분) 발송을 멈춘다: Vercel → Settings → Environment Variables에서 `VAPID_PRIVATE_KEY`(Production)를 잠시 지우고 **Redeploy**, 또는 Vercel Cron에서 `/api/notify/dispatch`를 끈다. 키가 없으면 `dispatchPending`이 아무것도 보내지 않고 알림은 앱 안 목록에만 쌓인다.
2. (2~5분) 범위 확인(읽기만): 본사 `/admin/ops`의 발송 크론 기록, `notifications` 표에서 최근 한 시간 `kind`·건수(서비스 키로 읽기 조회).
3. (5~8분) 원인 코드 PR을 찾고 코드 롤백(위 1).
4. (8~10분) 받은 사람에게 안내가 필요하면 사장님이 문구를 정한다(앱 안 공지 `notice-banner`). 잘못 쌓인 알림 행을 지우는 것은 데이터 변경이라 승인 뒤.
5. 키를 다시 넣고 재배포, 한 건 시험 발송으로 확인.

### AI 비용이 급증했을 때
1. (0~2분) 끈다: 본사 `/admin/ai`에서 플랫폼 기본값을 모두 끔. 바로 수동 흐름으로 돈다(AI는 제안만이라 업무는 멈추지 않는다).
2. (2~4분) 그래도 호출이 계속되면 Vercel Production의 `ANTHROPIC_API_KEY`를 지우고 Redeploy. 키 유출이 의심되면 Anthropic 콘솔에서 키를 **폐기**(사장님).
3. (4~7분) 원인: `/admin/ai` 기능별 사용량·샵별 호출 수, `ai_usage` 표 최근 한 시간(읽기). 한 샵이 반복 호출하는지(하루 상한 200 확인), 재시도 폭주인지.
4. (7~10분) Anthropic 콘솔에서 월 사용 한도를 낮춘다(사장님). 원인 고친 PR → 병합 → AI 다시 켜기.

### 로그인이 막혔을 때 (모두 또는 많은 사람이)
1. (0~2분) 범위: 운영 주소 `/login` 열림 여부, `npm run check:prod`, Supabase 상태 페이지(status.supabase.com), Vercel 상태.
2. (2~4분) 최근 배포가 원인이면 코드 롤백(위 1). 대부분 이걸로 끝난다.
3. (4~6분) 특정 사람만이면: 로그인 한도(`docs/rate-limits.md`) — 같은 IP에서 여러 번 틀리면 잠깐 막힌다. 비밀번호 재설정 메일이 안 가면 메일 설정(`docs/mail-setup.md`, Resend Logs).
4. (6~8분) Supabase Auth 설정(사이트 주소·리디렉트 URL·SMTP)이 바뀌지 않았는지 대시보드에서 확인 — 바꾸는 것은 사장님.
5. (8~10분) 샵에 안내: 시범 샵 대표님께 문자로 "잠시 후 다시" + 예상 시간. 급한 강습은 전화로 진행하고 나중에 입력.

## 사고 뒤
- 무슨 일이 언제 있었고 무엇을 했는지 `docs/incidents/<날짜>.md`에 짧게 남긴다(개인정보 없이).
- 같은 일을 막는 테스트(회귀 테스트)를 추가한 PR로 마무리한다.
