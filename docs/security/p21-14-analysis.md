# P21-14: 남은 기본 권한 정리 — 표·뷰 MAINTAIN, anon의 private 스키마 USAGE, 시퀀스 권한 분석

작성 2026-11-07. 위험도 P3(심층 방어). P21-12(표 쓰기, 2026-11-06 적용)·P21-13(private 함수, 2026-11-07 적용)의 마지막 단계.
마이그레이션: `supabase/migrations/20261107064020_p21_14_maintain_revoke.sql` · 회귀 테스트: `supabase/tests/maintain_grants.test.sql`.
근거는 로컬 DB(main 마이그레이션 70개 + 시드) 카탈로그 조회. 운영은 읽기 전용 스키마 덤프(2026-11-07 15:30, P21-13 적용 직후)로 같은지 맞췄다(쓰기 없음).

## 1. 지금 상태

| 대상 | 상태 (로컬 = 운영) | 왜 문제인가 |
|---|---|---|
| public 표·뷰의 MAINTAIN (PG17) | anon: 표 48·뷰 1(`customer_consent_state`). authenticated: 표 48·뷰 2(+`instructor_assignments`). PUBLIC 0. 없는 곳: `consult_licenses`·`consult_plans`·`consult_usage_packs`·`shop_channels`(둘 다), `instructor_assignments`(anon) | MAINTAIN은 VACUUM·ANALYZE·REINDEX·CLUSTER·REFRESH MATERIALIZED VIEW·**LOCK TABLE**을 허락한다. LOCK TABLE … ACCESS EXCLUSIVE는 표 전체를 잠가 다른 사용자의 읽기·쓰기를 멈춘다. REST(PostgREST)로는 이런 문장을 보낼 수 없어 **바로 악용할 수는 없다**. 앱 역할이 쓸 일도 없다. |
| private 스키마 USAGE | anon·authenticated·service_role 모두 `U` | anon이 실행할 수 있는 private 함수는 P21-13 뒤 0개라 USAGE만으로 할 수 있는 일은 없다. 그래도 새 함수가 기본값(PUBLIC 실행)으로 생기면 anon까지 닿는 길이 USAGE다. |
| public 시퀀스 7개 | anon `rU`(SELECT·USAGE), authenticated `rwU`(SELECT·UPDATE·USAGE) | anon은 표 INSERT가 없어(P21-12) nextval을 쓸 일이 없다. authenticated의 setval(UPDATE)·시퀀스 조회(SELECT)도 쓰는 곳이 없다. |

운영 덤프 대조: anon MAINTAIN 49곳, authenticated 50곳, 이름 목록이 로컬과 **같다**.

## 2. 바꾸는 것

1. public의 모든 표·뷰(`relkind` r·p·v·m)에서 `revoke maintain … from public, anon, authenticated`. service_role(서버)·postgres는 그대로.
2. `revoke usage on schema private from anon`. authenticated·service_role은 그대로(정책·검사 제약·뷰가 private 함수를 부른다, P21-13 분석 2절).
3. `revoke all on all sequences in schema public from anon`, `revoke select, update on all sequences in schema public from authenticated`.
   authenticated의 **USAGE는 남긴다**: `resorts`·`sports`는 serial 열이고 본사가 정책(`platform_admin_all`)으로 직접 추가한다(nextval에 USAGE 필요).
   나머지 5개(`access_logs`·`ai_usage`·`customer_consents`·`feedback`·`ops_events`)는 identity 열이라 INSERT에 시퀀스 권한이 필요 없다.

storage·auth·realtime 등 Supabase가 관리하는 스키마는 건드리지 않는다. 기본 권한(`ALTER DEFAULT PRIVILEGES`)도 건드리지 않는다(Supabase 설정에 가까워 사장님 결정, 새 객체는 테스트가 잡는다).

## 3. 앱 코드 확인

- `src`·`scripts`에 `currval`·`nextval`·`setval`·`LOCK TABLE`·`VACUUM`·`ANALYZE`를 쓰는 곳 없음. DB 함수 중 security invoker로 시퀀스를 다루는 것 0개.
- Realtime 구독(`.channel(`·`postgres_changes`) 없음. 공개 storage 버킷 없음(`certs`는 비공개).
- anon 키는 서버 쪽 Supabase 클라이언트(`src/lib/supabase/server.ts`, `src/proxy.ts`)에서만 쓴다. 로그인하지 않은 방문자의 화면(로그인·/join·/consent·안내 페이지)은 Auth API나 service_role RPC를 쓴다(P21-12 분석 2절).

## 4. 깨질 수 있는 경로와 확인

| # | 깨질 수 있는 경로 | 왜 괜찮다고 보는가 | 확인 |
|---|---|---|---|
| 1 | 로그인 사용자의 모든 RLS 조회·쓰기(샵·강습팀·강사·본사) | authenticated의 private USAGE·함수 실행은 그대로. MAINTAIN은 조회·쓰기와 무관 | pgTAP 전체(859개), 테스트 8번(authenticated RLS 조회), E2E 핵심, 적용 뒤 스모크 21화면 |
| 2 | 로그인 전 화면(로그인·가입·/join·/consent·안내) | anon 정책은 resorts·sports `true`뿐이고 private를 쓰지 않는다. 나머지는 Auth API·service_role RPC | E2E 셀프 등록·동의 링크·로그인, check:prod(로그인 전 화면) |
| 3 | anon이 `customer_consent_state` 뷰 조회 | 원래도 실패한다(P21-13 뒤 is_minor 실행 불가). 오류 문구만 "schema private" 권한으로 바뀐다(둘 다 42501). 앱은 anon으로 이 뷰를 읽지 않는다 | pgTAP customer_consents·view_grants |
| 4 | 본사의 스키장·종목 추가(serial 열) | authenticated USAGE 유지(nextval 가능) | 테스트 4번 |
| 5 | 접속 기록·AI 사용량·동의 기록·피드백·운영 기록 쓰기 | identity 열이라 시퀀스 권한이 필요 없다. 대부분 security definer RPC로 쓴다 | pgTAP access_logs·ai_usage·customer_consents·feedback·ops_alerts, E2E 피드백 |
| 6 | 서버(service_role: 웹훅·크론·RPC) | service_role 권한은 하나도 바꾸지 않는다 | E2E 웹훅·셀프 등록, 다음 03:00 정리 작업 기록 |
| 7 | 자동 VACUUM·ANALYZE, pg_cron, 덤프, 마이그레이션 | 슈퍼유저·postgres 권한으로 돈다 | 적용 뒤 `supabase db dump`·check:prod |
| 8 | Supabase 대시보드(표 편집기·SQL 편집기) | postgres·supabase_admin 역할이라 영향 없음 | 사장님 대시보드 사용 |
| 9 | 앞으로 만드는 표·뷰·시퀀스 | 기본 권한으로 같은 권한이 다시 붙는다 → 테스트 1~3번이 CI에서 잡는다 | CI db |

증상이 생기면 `permission denied for schema private`(anon), `permission denied for sequence …`(serial 표 INSERT)로 나온다. 그 하나만 다시 주면 된다(승인 뒤). 전체 되돌리기는 마이그레이션 머리 주석.

## 5. 적용 전 확인 방법 (운영, 읽기 전용)

1. `node scripts/ops/migration-preflight.mjs`, `npx supabase db push --linked --dry-run` → 이 파일 1개만.
2. `npx supabase db dump --linked --schema public -f <임시>` → `GRANT … ON TABLE "public".… TO "anon"` 중 `ALL` 또는 `MAINTAIN`이 든 곳 49개, authenticated 50개(1절과 같은지). 새 표·뷰가 생겼으면 목록이 늘어난다 — 마이그레이션은 모든 표·뷰를 돌므로 그대로 적용해도 되지만, 되돌리기 주석의 "원래 없던 곳" 목록을 다시 맞춘다.
3. 같은 덤프: 시퀀스 7개, anon `SELECT,USAGE`, authenticated `ALL`.
4. `npx supabase db dump --linked --schema private` → `GRANT USAGE ON SCHEMA "private" TO "anon"` 1줄.
5. 실사용자 0명 확인(@winter-partner.test 제외). 실사용자가 있으면 사용 시간이 적은 때 적용.

## 6. 적용 뒤 확인 (운영, 읽기 전용)

1. public 덤프: anon·authenticated `GRANT` 줄에 `MAINTAIN`·`ALL ON TABLE` 없음(authenticated는 SELECT·INSERT·UPDATE·DELETE 표 수가 적용 전과 같음: 49·45·43·44). 시퀀스: anon 줄 없음, authenticated `USAGE`만.
2. private 덤프: anon USAGE 줄 없음, authenticated·service_role USAGE 그대로.
3. 권한 외 스키마 차이 0.
4. `check:prod`, 운영 스모크 21화면, 로그인 전 화면(/login) 열기.
5. `docs/ops-check.md` ⑦(표 권한) — `auth_rw` 열이 적용 전과 같다.
