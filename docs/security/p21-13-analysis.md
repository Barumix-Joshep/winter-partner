# P21-13 나머지: private 함수 PUBLIC 실행·public 시퀀스 anon UPDATE 회수 분석

작성 2026-11-06. 위험도 P3(심층 방어). P21-12(표 권한, 2026-11-06 14:44 운영 적용)의 후속.
마이그레이션: `supabase/migrations/20261106055522_private_fn_revoke.sql` · 회귀 테스트: `supabase/tests/private_function_grants.test.sql`.
근거는 로컬 DB(main 마이그레이션 69개 + 시드) 카탈로그 조회이고, 운영은 읽기 전용 스키마 덤프로 같은지만 맞췄다(쓰기 없음).

## 1. 지금 상태

| 대상 | 상태 | 왜 문제인가 |
|---|---|---|
| private 함수 87개 | 65개는 ACL이 비어 있다(= PostgreSQL 기본값으로 PUBLIC에 EXECUTE). anon·authenticated 모두 private 스키마 USAGE가 있어 실행할 수 있다. 22개는 이미 PUBLIC 회수(consult_* 등). | private는 API(PostgREST, `public`·`graphql_public`만 노출)에 열려 있지 않아 **바로 부를 수는 없다**. 그래도 invoker 함수·뷰·새 경로가 생기면 서버 전용 함수(예: `notify_platform_admins` 본사 알림 만들기, `new_token`, `token_hash`)를 로그인 사용자·anon이 부를 수 있게 된다. |
| public 시퀀스 7개 | anon·authenticated·service_role 모두 `rwU`(USAGE·SELECT·UPDATE) | anon은 표에 INSERT 권한이 없다(P21-12). setval(UPDATE)로 번호를 돌릴 이유가 없다. |

운영 덤프(2026-11-06 14:50, 읽기 전용) 대조: private 함수 87개, PUBLIC 실행 65개. 이름 목록이 로컬과 **같다**.
운영 정책 121개(public + storage)가 부르는 private 함수는 20개이고, 모두 아래 authenticated 허용 목록 안에 있다.

## 2. authenticated에 다시 주는 함수 (24개 + 이미 직접 부여된 2개)

카탈로그에서 뽑았다. 로그인 사용자의 질의가 **자기 권한으로** 함수를 부르는 곳은 네 가지다.

| 어디서 | 뽑은 방법 | 함수 |
|---|---|---|
| RLS 정책 (public 표 + `storage.objects`, 정책 역할은 모두 authenticated) | `pg_depend`(classid `pg_policy`) | is_platform_admin, is_shop_member, is_shop_owner, is_any_shop_member, shares_shop, is_lesson_team_member, is_lesson_team, my_instructor_id, is_instructor_user, is_exclusive, job_shop_id, job_open_for_bids, is_assigned, has_job_link, customer_shop_id, can_see_settlement, is_exclusive_instructor, is_approved_shop, (이미 부여) cert_file_locked, cert_folder_has_room |
| 검사 제약 (inquiries·conversations·shop_channels 암호문 형식) | `pg_depend`(classid `pg_constraint`) | is_encrypted, is_hmac |
| 뷰 (`customer_consent_state`는 security_invoker, `instructor_assignments`는 정의자 뷰지만 뷰 안 함수는 호출자 권한으로 검사) | `pg_depend`(classid `pg_rewrite`) | is_minor, setting_int, (위) my_instructor_id |
| invoker 함수 본문 | security invoker 함수의 `prosrc`에서 `private.<이름>(` 검색 | create_job → check_won, revisit_candidates → season_of, set_week_availability·save_instructor_profile → my_instructor_id, review_cert → is_platform_admin, 트리거 require_guardian → is_minor |

빼는 것(authenticated 실행 회수, 41개): 트리거 함수(guard_*·audit_*·limit_*·*_immutable·touch_updated_at·track_consent 등 — **트리거는 발동할 때 EXECUTE를 검사하지 않는다**, 만들 때만), security definer 함수 안에서만 부르는 보조 함수(소유자 권한으로 돈다: has_time_conflict, penalty_points_for, withholding_amount, ai_quota_ok, ai_month_cost, may_bypass_guard, my_lesson_team, registration_shop, token_hash, new_token, notify_platform_admins, ops_check_alerts …), 가입 트리거 `handle_new_user`(auth.users 트리거, security definer).

## 3. service_role

서버(service_role)는 public의 security definer RPC를 거치거나 표에 직접 쓴다. 표에 직접 쓰면 검사 제약(is_encrypted·is_hmac)이 service_role 권한으로 돈다.
**서버 동작을 바꾸지 않으려고 PUBLIC으로 실행하던 65개를 모두 service_role에 직접 준다.** 이미 직접 관리하는 22개(consult_* 등)는 건드리지 않는다(지금도 service_role 실행 없음).

## 4. anon

anon에 걸린 정책은 `resorts.read_all`·`sports.read_all`(SELECT, `true`)뿐이고 private 함수를 부르지 않는다. anon 화면(/join·/consent·로그인)은 모두 service_role RPC나 Auth API다(P21-12 분석 2절). → **anon 실행 0개.**
private 스키마 USAGE(anon)는 이번에 건드리지 않는다(함수 실행이 0이면 USAGE만으로는 할 수 있는 것이 없다. 회수는 후속 제안).

## 5. 시퀀스

`revoke update on all sequences in schema public from anon` — anon의 setval만 회수한다. USAGE·SELECT(nextval·currval)는 그대로 둔다(지시 범위). anon은 표 INSERT가 없어 USAGE도 쓰지 않는다 → 후속 제안. authenticated는 serial 열 표(access_logs·ai_usage·feedback·ops_events·customer_consents 등)에 RLS 아래 쓰기가 있을 수 있어 그대로 둔다.

## 6. 깨질 수 있는 경로와 확인

| 깨질 수 있는 경로 | 왜 괜찮다고 보는가 | 확인 |
|---|---|---|
| 로그인 사용자의 모든 RLS 조회·쓰기(샵·강사·본사 화면, Realtime 알림 구독) | 정책 함수 20개 모두 authenticated에 다시 부여. 테스트 3번이 `pg_depend`로 **새 정책까지** 자동으로 본다 | pgTAP 전체(842개), E2E 핵심 세트 |
| 자격증 이미지 올리기·보기(storage 정책) | cert_* 2개는 원래 직접 부여, is_platform_admin·my_instructor_id 부여 | E2E 자격증, pgTAP storage_certs·certs |
| 손님 목록·동의 상태(`customer_consent_state`, security_invoker 뷰) | is_minor·setting_int 부여 | pgTAP customer_consents, E2E 미성년 동의 |
| 강습 등록(`create_job`), 재방문 후보(`revisit_candidates`), 가능 일정·프로필 저장, 자격증 검토 | invoker 함수가 부르는 check_won·season_of·my_instructor_id·is_platform_admin 부여 | pgTAP create_job·revisit_candidates, E2E 강습 등록·가능 일정 |
| 문의·상담 대화·채널 쓰기(암호문 검사 제약) | is_encrypted·is_hmac을 authenticated·service_role에 부여. 테스트 4·5번이 검사 제약 함수를 자동으로 본다 | pgTAP consult_*, E2E 상담 웹훅·인박스 |
| 트리거(배정 겹침·승인 잠금·감사 기록·입찰 한도·보호자 필수 등) | 트리거는 발동 때 EXECUTE를 검사하지 않음. invoker 트리거 중 private 함수를 부르는 것은 require_guardian → is_minor(부여)뿐 | pgTAP 전체(겹침·잠금·감사·한도 테스트) |
| 가입 → 프로필 생성(auth.users 트리거 `handle_new_user`) | 트리거 + security definer. supabase_auth_admin이 발동해도 EXECUTE 검사 없음 | E2E 가입·로그인, pgTAP auth |
| 서버 경로(웹훅·크론·/join·/consent·RPC) | service_role에 65개 그대로 부여, 그 밖은 security definer(소유자 postgres) | E2E 셀프 등록·동의·웹훅, 단위 테스트 |
| pg_cron·운영 스크립트·덤프 | postgres 권한으로 돈다 | 적용 뒤 check:prod |
| 앞으로 만드는 private 함수 | 기본값으로 PUBLIC 실행이 붙는다 → 테스트 1번이 CI에서 잡는다. 정책에서 쓰는데 authenticated 부여를 잊으면 테스트 3·4번이 잡는다 | CI db |

## 7. 적용 전 확인 방법 (운영, 읽기 전용)

1. `node scripts/ops/migration-preflight.mjs`, `npx supabase db push --linked --dry-run` → 이 파일 1개만.
2. `npx supabase db dump --linked --schema private -f <임시>` → `CREATE OR REPLACE FUNCTION "private"`가 87개, 그중 `REVOKE ALL ON FUNCTION … FROM PUBLIC`이 없는 것 65개, 이름이 마이그레이션 머리 주석의 되돌리기 목록과 같은지. 다르면(새 private 함수가 그사이 생겼으면) 멈추고 그 함수가 정책·제약·뷰·invoker 함수에서 쓰이는지 본다.
3. `npx supabase db dump --linked --schema public,storage` → `CREATE POLICY` 안의 `"private"."<함수>"`가 모두 허용 목록(26개) 안인지(2026-11-06: 정책 121개, 함수 20개, 밖 0).
4. 실사용자 0명 확인(@winter-partner.test 제외). 실사용자가 있으면 사용 시간이 적은 때 적용.

## 8. 적용 뒤 확인 (운영, 읽기 전용)

1. private 덤프: PUBLIC 회수가 87개 전부, `GRANT ALL ON FUNCTION "private".… TO "authenticated"`가 26개, `TO "service_role"` 65개.
2. public 덤프: 시퀀스 7개에 anon `GRANT SELECT,USAGE`만(UPDATE 없음).
3. `check:prod`, 운영 스모크 21화면(샵·강습팀·강사 로그인 → RLS 정책 함수가 실제로 도는지), 강사 자격증 화면·손님 목록 화면 열기.
4. 문제가 생기면: 증상이 `permission denied for function <이름>`이면 그 함수 하나만 `grant execute on function private.<이름>(…) to authenticated`(사장님 승인 뒤). 전체 되돌리기는 머리 주석.

## 9. 후속 제안 (이 PR에서는 바꾸지 않음)

- anon의 private 스키마 USAGE 회수, public 시퀀스 anon USAGE·SELECT 회수.
- anon·authenticated의 표 MAINTAIN 권한(PG17: VACUUM·ANALYZE·REINDEX·LOCK TABLE). P21-12에서 남았다. 앱 역할이 쓸 일이 없다.
- 기본 권한(`ALTER DEFAULT PRIVILEGES … IN SCHEMA private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`)으로 새 함수의 출발점 바꾸기 — Supabase 설정에 가까워 사장님 결정.
