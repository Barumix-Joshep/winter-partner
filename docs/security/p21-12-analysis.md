# P21-12 표 직접 권한 분석 (anon·authenticated)

작성 2026-11-06. 위험도 P2. P21-11(뷰 쓰기 권한 회수, PR #41)의 후속.
분석은 로컬 DB(main의 마이그레이션 67개를 처음부터 적용 + 시드)의 카탈로그 조회와 코드 검색으로 했다. 운영 DB에는 붙지 않았다.
회수 마이그레이션: `supabase/migrations/20261106032439_table_write_revoke.sql` · 회귀 테스트: `supabase/tests/table_grants.test.sql`.

## 1. 출발점

2026-11-06 운영 읽기 전용 점검: public 표 49개 모두 RLS가 켜져 있고 anon·PUBLIC 쓰기 정책은 0개다.
그런데 Supabase 기본 권한(`ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO anon, authenticated`) 때문에 표를 만들 때마다
anon·authenticated에 모든 권한이 직접 붙었다. 로컬 main에서 같은 상태를 확인했다.

| 역할 | 권한 | 표 수 | 표 |
|---|---|---|---|
| anon | INSERT·UPDATE·DELETE·TRUNCATE·REFERENCES·TRIGGER | 44 | 아래 48개 중 ai_feedback·conversations·messages·shop_consult_settings를 뺀 전부 |
| anon | INSERT·TRUNCATE·REFERENCES·TRIGGER | 1 | ai_feedback (P22에서 UPDATE·DELETE만 회수) |
| anon | TRUNCATE·REFERENCES·TRIGGER | 3 | conversations, messages, shop_consult_settings (P22에서 쓰기만 회수) |
| authenticated | TRUNCATE·REFERENCES·TRIGGER | 48 | shop_channels를 뺀 전부 |
| PUBLIC | (직접 준 표 권한 없음) | 0 | |

shop_channels는 P22-4에서 이미 모두 회수했다. PR #45(P23-2)가 만드는 consult_plans·consult_licenses·consult_usage_packs도 같은 마이그레이션에서 회수한다.

### 왜 문제인가

- **TRUNCATE는 RLS를 거치지 않는다.** 로컬에서 로그인 사용자 역할로 `truncate public.notifications`가 그대로 성공했다(테스트 트랜잭션 안이라 되돌림). anon으로 `truncate public.resorts`는 권한 검사를 통과하고 외래 키 검사에서야 멈췄다.
- 지금은 PostgREST가 TRUNCATE를 보낼 방법이 없어 바로 악용되지는 않는다. 하지만 security invoker 함수나 새 경로가 생기면 한 번에 표가 빈다.
- anon INSERT·UPDATE·DELETE는 RLS 정책이 없어서 0행이 되지만, 막는 것이 "정책이 없다"는 한 겹뿐이다. 누가 실수로 `to public` 정책을 만들면 바로 열린다.
- REFERENCES(외래 키 만들기)·TRIGGER(트리거 만들기)는 앱 역할이 쓸 일이 없다.

## 2. anon 경로 전수 (코드)

| 경로 | 클라이언트 | 표 직접 접근 | 결론 |
|---|---|---|---|
| `/join/[token]` 손님 셀프 등록 (page·actions) | `createAdminClient()` (service_role) | 없음. `public_registration_context`·`public_rate_limit`·`public_register_customer` RPC | anon 권한 불필요. RPC 실행 권한도 service_role만 |
| `/consent/[token]` 보호자 동의 (page·actions) | service_role | 없음. `public_consent_context`·`public_rate_limit`·`public_submit_consent` RPC | 같음 |
| `/api/webhooks/kakao/[token]`, `/api/webhooks/instagram` | `src/lib/channels/*/deps.ts`의 service_role | service_role로만 | anon 무관 |
| `/api/channels/instagram/callback` | service_role (`consult_connect_instagram` RPC) | 없음 | anon 무관 |
| `/api/notify/dispatch`, `/api/maintenance/daily` (크론) | service_role (`src/lib/notify/dispatch.ts`, purge RPC) | service_role로만 | anon 무관 |
| `/login` 가입·로그인·비밀번호 재설정, `/auth/confirm` | anon 키 서버 클라이언트, **Auth API만** | 없음. 프로필은 `auth.users` 트리거 `private.handle_new_user()`(security definer)가 만든다 | anon 권한 불필요 |
| `src/proxy.ts` (세션 갱신) | anon 키 | 없음 (`auth.getClaims()`만) | |
| 의견 보내기 `src/components/feedback-actions.ts` | service_role (`submit_feedback` RPC) | 없음 | |
| 공개 화면(`/`, `/help`, `/privacy`, `/terms`, `/offline`, 에러 화면) | 표 조회 없음 | 없음 | |
| 브라우저 Supabase 클라이언트 | **없음** (`createBrowserClient` 미사용). 앱의 모든 DB 호출은 서버에서 | | |
| 저장소(자격증 이미지) | storage 스키마 정책, authenticated만 | public 표 권한과 무관 | |

DB 쪽 확인:

- anon·PUBLIC에 걸린 정책은 `resorts.read_all`·`sports.read_all`(SELECT) 2개뿐이다. 쓰기 정책 0.
- anon이 실행할 수 있는 public 함수 0개(`has_function_privilege('anon', …)`).
- public 표 소유자는 모두 postgres. 트리거는 마이그레이션(postgres)이 만들었고, 외래 키 검사는 표 소유자 권한으로 돈다. 그래서 앱 역할에 REFERENCES·TRIGGER가 필요 없다.
- 마이그레이션·테스트·스크립트·앱 코드에 TRUNCATE 문장이 없다(`scripts/ops/migrations.mjs`의 검사용 정규식뿐).
- E2E의 `userClient()`는 anon 키로 **로그인한 뒤**(authenticated) 쓰고, `password-policy.spec.ts`의 anon 호출은 Auth API(`auth.signUp`)뿐이다.

**결론: anon이 public 표에 직접 써야 하는 경로는 없다. 예외 표 없음.**

## 3. authenticated

- INSERT·UPDATE·DELETE: 로그인 사용자 화면이 RLS 정책 아래에서 직접 쓴다(배정·가능 일정·입찰·손님·강사 프로필 등 정책 48개). **그대로 둔다.** 회귀 테스트가 "쓰기 정책이 있는 표는 그 명령 권한이 남아 있다"를 확인한다(inquiries의 열 단위 UPDATE 포함).
- TRUNCATE: 앱 코드·함수 어디에도 없다. 회수.
- REFERENCES·TRIGGER: 앱 역할이 외래 키·트리거를 만들 일이 없다. 회수.

## 4. 마이그레이션이 바꾸는 것

`20261106032439_table_write_revoke.sql` — public의 모든 표(relkind r·p)를 돌며:

```sql
revoke insert, update, delete, truncate, references, trigger on public.<표> from public, anon;
revoke truncate, references, trigger on public.<표> from authenticated;
```

- SELECT는 건드리지 않는다(아래 6번 후속 제안).
- 표 단위 회수는 같은 권한의 열 단위 권한도 함께 지운다(PostgreSQL 동작). anon에 열 단위 쓰기 권한은 원래 없다.
- 데이터 변경 없음. 머리 주석에 원인·영향·되돌리기 문장(적용 전 상태 그대로)이 있다. 되돌리기 문장은 로컬에서 실행해 테스트가 다시 실패하는 것으로 확인했다.
- 마이그레이션 시각이 PR #45(`20261106015911_consult_license.sql`)보다 뒤라, 어느 순서로 병합해도 consult 표까지 덮는다.

## 5. 깨질 수 있는 경로와 확인

| 깨질 수 있는 경로 | 왜 괜찮다고 보는가 | 확인 |
|---|---|---|
| 손님 셀프 등록 `/join/[token]` | service_role RPC | E2E 핵심 세트(셀프 등록) |
| 보호자 동의 `/consent/[token]` | service_role RPC | E2E 핵심 세트(미성년 동의) |
| 가입 → 프로필 생성 | Auth + security definer 트리거 | E2E 로그인·가입 |
| 카카오·인스타 웹훅, 크론(알림 재발송·90일 정리) | service_role | E2E 상담 웹훅, 단위 테스트 |
| 로그인 사용자 직접 쓰기(가능 일정·입찰·배정 등) | INSERT·UPDATE·DELETE 유지 | pgTAP 전체 + E2E 핵심 세트 |
| Realtime 구독 | SELECT만 필요, 그대로 | 알림 E2E |
| 운영 점검 스크립트·덤프·백업 | postgres·service_role로 돈다. anon·authenticated 권한과 무관 | 적용 뒤 `check:prod` |
| 앞으로 PostgREST/RPC로 TRUNCATE를 쓰려는 코드 | 지금은 없음. 생기면 권한 거부(42501) | 테스트 4번 |

### 적용 전·후 확인 방법 (운영, 읽기 전용 — 설명만, 이 작업에서 실행하지 않음)

1. 적용 전 덤프: `npx supabase db dump --linked --schema public -f <임시파일>` 후
   `grep -E '^GRANT .* ON TABLE "public"\.' <임시파일> | grep -E 'TO "(anon|authenticated)"'`
   → 지금은 대부분 표에 `GRANT ALL ON TABLE … TO "anon"`·`TO "authenticated"`가 보인다.
2. 영향 표 수 조회(SQL 편집기, 읽기 전용):
   ```sql
   select count(*) filter (where has_table_privilege('anon', c.oid, 'TRUNCATE')) anon_truncate,
          count(*) filter (where has_table_privilege('anon', c.oid, 'INSERT')) anon_insert,
          count(*) filter (where has_table_privilege('authenticated', c.oid, 'TRUNCATE')) auth_truncate
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p');
   ```
3. `node scripts/ops/migration-preflight.mjs` (데이터 변경·제약 없음이 나와야 한다).
4. 적용 뒤 같은 덤프 grep: anon은 `GRANT SELECT`만, authenticated는 `GRANT SELECT,INSERT,UPDATE,DELETE`(+ 원래 있던 MAINTAIN 등)만 남아야 한다. 2번 조회는 0·0·0.
5. 적용 뒤 동작: `check:prod`·스모크, 시범 샵 셀프 등록 링크 1회(테스트 손님), 강사 가능 일정 추가·삭제 1회.

## 6. 후속 제안 (이 PR에서는 바꾸지 않음)

- **anon SELECT 회수**: anon은 public 표 48개에 SELECT 권한이 있지만 쓰는 경로가 없다. 정책이 있는 resorts·sports도 anon 화면에서 읽지 않는다(로그인 뒤 화면에서만). RLS로 0행이 되지만 PostgREST OpenAPI(`/rest/v1/`)에 표·열 이름이 anon에게 보이는 원인이다. 별도 작업으로 회수를 제안한다(뷰 포함).
- **authenticated의 쓰지 않는 쓰기 권한**: 다음 14개 표는 authenticated 쓰기 정책이 없어 INSERT·UPDATE·DELETE가 항상 RLS에 막힌다(쓰기는 security definer RPC·service_role로만). 정책 실수 대비로 회수할 수 있다: access_logs, ai_usage, audit_events, consent_links, customer_consents, customer_erasures, feedback, health_warnings, lesson_corrections, ops_events, pay_types, registration_links, shop_change_requests, shop_instructor_pay_type_log.
- **기본 권한 자체**: `alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from anon, authenticated` 같은 문장으로 새 표의 출발점을 바꿀 수 있다. Supabase가 관리하는 설정이라 사장님 결정 뒤에만. 그 전까지는 `table_grants.test.sql`이 새 표를 잡는다.
