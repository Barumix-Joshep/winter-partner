-- 보안 7(DB, P21-12 위험도 P2): public 스키마의 모든 표에서 쓸 일 없는 직접 권한을 회수한다. 읽기(select)는 그대로.
--   - anon·PUBLIC: INSERT·UPDATE·DELETE·TRUNCATE·REFERENCES·TRIGGER 회수
--   - authenticated: TRUNCATE·REFERENCES·TRIGGER 회수 (INSERT·UPDATE·DELETE는 RLS 정책이 행을 가르므로 그대로 둔다)
--
-- 원인: Supabase 기본 권한(ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO anon, authenticated)이 표를 만들 때
--   anon·authenticated에 모든 권한을 직접 준다. 표마다 RLS가 켜져 있고 anon 쓰기 정책은 0이라 행 쓰기는 막히지만,
--   TRUNCATE는 RLS를 거치지 않는다(로컬 확인: 로그인 사용자 역할로 `truncate public.notifications`가 성공).
--   지금은 PostgREST로 TRUNCATE를 보낼 수 없어 바로 악용되지는 않지만, invoker 함수·새 경로가 생기면 한 번에 표가 비는 구멍이다.
-- 분석(docs/security/p21-12-analysis.md): anon이 표에 직접 쓰는 경로는 없다. 손님 셀프 등록(/join)·동의 링크(/consent)·
--   웹훅·크론은 모두 서버의 service_role 클라이언트로 RPC를 부르고, 가입은 Auth API + auth.users 트리거(security definer)다.
--   REFERENCES(외래 키 생성)·TRIGGER(트리거 생성)는 마이그레이션(postgres)만 쓰고, 외래 키 검사는 표 소유자 권한으로 돈다.
--   → 예외 표 없음.
-- 영향: 권한만 회수, 데이터 변경 없음. 대상(로컬 main 기준 49개 표):
--   anon: 44개 표 DELETE·INSERT·REFERENCES·TRIGGER·TRUNCATE·UPDATE, ai_feedback INSERT·REFERENCES·TRIGGER·TRUNCATE,
--         conversations·messages·shop_consult_settings REFERENCES·TRIGGER·TRUNCATE
--   authenticated: 48개 표 REFERENCES·TRIGGER·TRUNCATE (shop_channels·consult_* 표는 이미 없음)
--   PUBLIC: 직접 준 표 권한 없음(혹시 있으면 같이 회수)
-- 앞으로: 새 표도 기본 권한 때문에 같은 상태로 만들어진다. supabase/tests/table_grants.test.sql이 CI에서 잡는다.
--   새 표를 만들면 같은 마이그레이션에서
--     revoke insert, update, delete, truncate, references, trigger on public.<표> from public, anon;
--     revoke truncate, references, trigger on public.<표> from authenticated;
--
-- 되돌리기(필요할 때만 — TRUNCATE 구멍이 다시 열린다). 적용 전 상태를 그대로 돌린다:
--   do $$ declare t text; begin
--     foreach t in array array['access_logs','ai_usage','assignments','audit_events','availability','bids','consent_links',
--       'customer_consents','customer_contacts','customer_erasures','customer_links','customers','exclusive_invites','feedback',
--       'health_warnings','inquiries','instructor_certs','instructor_penalties','instructor_resorts','instructor_sports','instructors',
--       'job_customers','job_offers','job_prices','jobs','lesson_corrections','notifications','ops_events','pay_types','profiles',
--       'push_subscriptions','ratings','registration_links','resorts','settlement_items','settlements','shop_change_requests',
--       'shop_instructor_pay_type_log','shop_instructors','shop_knowledge','shop_members','shop_resorts','shops','sports'] loop
--       execute format('grant insert, update, delete, truncate, references, trigger on public.%I to anon', t);
--     end loop;
--     grant insert, truncate, references, trigger on public.ai_feedback to anon;
--     grant truncate, references, trigger on public.conversations, public.messages, public.shop_consult_settings to anon;
--     foreach t in array array['access_logs','ai_feedback','ai_usage','assignments','audit_events','availability','bids','consent_links',
--       'conversations','customer_consents','customer_contacts','customer_erasures','customer_links','customers','exclusive_invites',
--       'feedback','health_warnings','inquiries','instructor_certs','instructor_penalties','instructor_resorts','instructor_sports',
--       'instructors','job_customers','job_offers','job_prices','jobs','lesson_corrections','messages','notifications','ops_events',
--       'pay_types','profiles','push_subscriptions','ratings','registration_links','resorts','settlement_items','settlements',
--       'shop_change_requests','shop_consult_settings','shop_instructor_pay_type_log','shop_instructors','shop_knowledge',
--       'shop_members','shop_resorts','shops','sports'] loop
--       execute format('grant truncate, references, trigger on public.%I to authenticated', t);
--     end loop;
--   end $$;

do $$
declare t record;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    -- 표 단위 회수는 같은 권한의 열 단위 권한도 함께 지운다
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from public, anon', t.relname);
    execute format('revoke truncate, references, trigger on public.%I from authenticated', t.relname);
  end loop;
end $$;
