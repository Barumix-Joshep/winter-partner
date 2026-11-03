# 개발 루프 운영법

이 저장소는 Claude Code를 이 Mac에서 직접 돌려 개발한다. 진척의 기준은 `docs/tasks.json`이고,
claude.ai 진척 대시보드는 이 파일을 반영해 보여 준다.

## 처음 한 번
1. `npm install` (이 폴더의 node_modules는 지웠다. Mac에서 새로 설치해야 Mac용 바이너리가 깔린다)
2. `.env.local.example`을 `.env.local`로 복사하고 Supabase URL·키 입력
3. `npx supabase login` → `npx supabase link --project-ref <ref>` → `npx supabase db push`
4. `git remote add origin <GitHub 저장소 URL>` → `git push -u origin main`

## Superpowers 플러그인
`.claude/settings.json`에 등록돼 있어, 이 폴더에서 `claude`를 처음 열고 폴더를 신뢰하면 설치를 묻는다. 묻지 않으면 Claude Code 안에서 직접:

```text
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```

설치 후 Claude Code를 다시 시작하고 `/plugin`에서 superpowers가 켜졌는지 확인한다.

## 루프 돌리기
터미널에서 이 폴더로 와서 `claude` 실행 후:

```text
/loop docs/tasks.json에서 status가 todo인 첫 작업(due 순)을 골라 진행해. CLAUDE.md 규칙과 Superpowers 스킬(계획→TDD→검증)을 따르고,
작업마다 task/<번호> 브랜치를 만들어 커밋하고, 푸시 → 풀 리퀘스트 → CI 통과 확인 → squash 병합 → 로컬 main 갱신까지 해.
tasks.json의 status를 done으로, 막히면 blocked와 이유를 note에 적고 다음 작업으로 가.
되돌리기 어려운 결정이나 외부 계정이 필요한 일은 멈추고 나에게 물어.
```

간격 없이 `/loop`만 주면 Claude가 작업 길이에 맞춰 스스로 다음 회차를 잡는다.
하루 단위로 확인하려면 `/loop 1h …`처럼 간격을 준다.

## 풀 리퀘스트 흐름 (P20)
main에 바로 푸시하지 않는다. main 병합이 곧 Vercel 운영 배포다.

```text
git checkout main && git pull
git checkout -b task/P21-1
# … 작업, 로컬에서 npm test · npx supabase test db · npx playwright test …
git push -u origin task/P21-1
gh pr create --fill --body-file .github/pull_request_template.md   # 본문 칸을 채운다
gh pr checks --watch                                              # security · unit · db · e2e-core
gh pr merge --squash --delete-branch
git checkout main && git pull
```

- 마이그레이션이 있으면 `docs/pending-migrations.md`에 추가(CI 확인), `migration-pending` 라벨이 자동으로 붙는다. 원격 적용은 병합 후 사장님 승인.
- 느린 종합 시나리오(리허설·시즌)는 main 병합 뒤와 매일 밤 `e2e-full`에서 돈다. 실패하면 이슈가 생긴다.
- 운영 배포가 끝나면 `post-deploy`가 check:prod를 돌리고 실패하면 이슈를 남긴다.
- 자세한 것: `docs/ci.md`, 사고 때: `docs/rollback.md`.

## 대시보드 반영
claude.ai의 이 프로젝트 대화에서 "대시보드 갱신해줘"라고 하면 `docs/tasks.json`을 읽어 대시보드를 업데이트한다.
