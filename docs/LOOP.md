# 개발 루프 운영법

이 저장소는 Claude Code를 이 Mac에서 직접 돌려 개발한다. 진척의 기준은 `docs/tasks.json`이고,
claude.ai 진척 대시보드는 이 파일을 반영해 보여 준다.

## 처음 한 번
1. `npm install` (이 폴더의 node_modules는 지웠다. Mac에서 새로 설치해야 Mac용 바이너리가 깔린다)
2. `.env.local.example`을 `.env.local`로 복사하고 Supabase URL·키 입력
3. `npx supabase login` → `npx supabase link --project-ref <ref>` → `npx supabase db push`
4. `git remote add origin <GitHub 저장소 URL>` → `git push -u origin main`

## 루프 돌리기
터미널에서 이 폴더로 와서 `claude` 실행 후:

```text
/loop docs/tasks.json에서 status가 todo인 첫 작업(due 순)을 골라 진행해. CLAUDE.md 규칙을 따르고,
끝나면 lint·tsc 통과 확인 → 커밋 → tasks.json의 status를 done으로, 막히면 blocked와 이유를 note에 적고 다음 작업으로 가.
되돌리기 어려운 결정이나 외부 계정이 필요한 일은 멈추고 나에게 물어.
```

간격 없이 `/loop`만 주면 Claude가 작업 길이에 맞춰 스스로 다음 회차를 잡는다.
하루 단위로 확인하려면 `/loop 1h …`처럼 간격을 준다.

## 대시보드 반영
claude.ai의 이 프로젝트 대화에서 "대시보드 갱신해줘"라고 하면 `docs/tasks.json`을 읽어 대시보드를 업데이트한다.
