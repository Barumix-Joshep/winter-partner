## 변경 요약
<!-- 작업 번호(P20-1 …)와 무엇을 왜 바꿨는지 한두 줄 -->

## 테스트 결과
- [ ] 단위 (npm test):
- [ ] DB (supabase test db):
- [ ] E2E (npx playwright test, 핵심 세트 / 전체):
- [ ] 린트·타입 (npm run lint, npx tsc --noEmit):
<!-- 로컬에서 돌린 숫자를 적는다. 건너뛴 테스트가 있으면 이유를 적는다 -->

## 마이그레이션
- [ ] 없음
- [ ] 있음 → 파일: <!-- supabase/migrations/… --> · docs/pending-migrations.md 추가 · 원격 적용은 병합 후 사장님 승인
  - 화면 코드가 새 표·열을 읽는가? (그렇다면 병합=배포 전에 원격 적용 순서를 적는다)

## 롤백 방법
<!-- 코드: Vercel 이전 배포로 되돌리기 / git revert <커밋>. DB: 마이그레이션 머리 주석의 "되돌리기:" (docs/rollback.md) -->

## 사장님 확인이 필요한 것
<!-- 외부 설정, 비용, 운영 데이터 영향 등. 없으면 "없음" -->
