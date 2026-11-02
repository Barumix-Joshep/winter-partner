# 운영 테스트 데이터 정리 (P15)

P15 실호출 검증·리허설 때 운영 DB에 만든 가상 데이터를 한 번에 지우는 절차다. **실행 전에 사장님 확인을 받는다.**
지우면 되돌릴 수 없다(접속 기록·AI 사용 기록 포함).

## 무엇이 테스트 데이터인가
- 샵: 이름이 `[테스트]`로 시작하는 샵 — `[테스트] 하이원 렌탈`, `[테스트] 하이원 강습팀`
- 계정: 이메일이 `@winter-partner.test`로 끝나는 계정 7개 (test-admin, test-rental, test-team, test-inst1~4)
- 위 샵·계정에 연결된 손님(`[테스트] 손님…`, 010-0000-9xxx), 강습, 입찰, 정산, 동의 기록, 접속 기록, 건강 경고, AI 사용 기록
- 자격증 파일: 스토리지 `certs/<test-inst4 강사 id>/` 아래 가상 이미지 2장
- 로컬 파일: `.env.rehearsal.local`(테스트 계정 비밀번호, git 제외)

2026-11-02 기준 건수(읽기 전용으로 셈): 샵 2, 계정 7(운영 전체 계정 7 = 모두 테스트), 손님 3, 강습 5, 정산 2, 동의 1, 접속 기록 6, 건강 경고 1, AI 사용 58(+자격증 판독 2건은 샵 없음), 자격증 폴더 1.
실제 샵은 0개였다. 실제 샵이 생긴 뒤에 지울 때는 아래 미리보기에서 `[테스트]`·`@winter-partner.test` 외에는 아무것도 잡히지 않는지 반드시 확인한다.

## 순서
1. **미리보기**: `scripts/rehearsal/prod-cleanup.sql`의 1단계(SELECT)만 Supabase SQL Editor에서 실행해 지울 대상과 건수를 확인한다.
2. **사장님 확인**: 미리보기 결과를 보고 진행 여부를 정한다.
3. **자격증 파일 삭제**: Supabase 대시보드 → Storage → `certs` → 테스트 강사 폴더 삭제 (또는 `node --env-file=.env.local scripts/rehearsal/prod-cleanup-files.mjs --execute`).
4. **DB 삭제**: 같은 SQL 파일의 2단계(트랜잭션)를 SQL Editor에서 실행한다. 마지막 확인 SELECT가 모두 0이면 `commit;`, 아니면 `rollback;`.
5. **계정 삭제**: SQL의 auth.users 삭제가 포함돼 있다(프로필·강사 행은 연쇄 삭제).
6. 로컬 `.env.rehearsal.local` 삭제.

## 주의
- 접속 기록은 트리거로 삭제가 막혀 있다. 정리 SQL은 트랜잭션 안에서만 `app.log_purge`를 켜고 그 샵 기록만 지운다.
- AI 사용 기록을 지우면 이번 달 비용 합계(`/admin/ai`)에서 빠진다. 실제 청구는 Anthropic 콘솔에 남는다. 비용 기록을 남기고 싶으면 2단계의 `ai_usage` 삭제 줄을 빼면 된다(샵 연결만 끊긴다).
- 로컬 E2E 리허설 데이터(`@rehearsal.test`, `[테스트] 리허설 …`)는 로컬 DB에만 있고 `npx supabase db reset --local`로 사라진다.
