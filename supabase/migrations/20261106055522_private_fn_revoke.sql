-- 보안 7(DB, P21-13 나머지, 위험도 P3): private 함수의 PUBLIC 실행 권한과 public 시퀀스의 anon UPDATE를 회수한다.
--   - private 함수: PostgreSQL 기본값(함수를 만들면 PUBLIC에 EXECUTE)으로 65개가 anon·authenticated 모두 실행 가능했다.
--     PUBLIC에서 회수하고, 앱이 쓰는 역할에만 다시 준다.
--       · service_role: 회수 전에 PUBLIC으로 실행하던 65개 그대로(서버 동작을 바꾸지 않는다)
--       · authenticated: 로그인 사용자 질의가 자기 권한으로 부르는 24개만(+ 이미 직접 받은 cert_file_locked·cert_folder_has_room)
--       · anon: 0개 (anon에게 걸린 정책·화면 중 private 함수를 부르는 것이 없다)
--   - public 시퀀스 7개: anon의 UPDATE(setval) 회수. anon은 표에 INSERT 권한도 없다(P21-12).
-- authenticated에 다시 주는 24개와 근거(로컬 DB 카탈로그에서 뽑음, docs/security/p21-13-analysis.md):
--   RLS 정책(pg_depend, public 표 + storage.objects, 정책 역할은 모두 authenticated): is_platform_admin, is_shop_member, is_shop_owner,
--     is_any_shop_member, shares_shop, is_lesson_team_member, is_lesson_team, my_instructor_id, is_instructor_user, is_exclusive,
--     job_shop_id, job_open_for_bids, is_assigned, has_job_link, customer_shop_id, can_see_settlement, is_exclusive_instructor,
--     is_approved_shop (+ cert_file_locked, cert_folder_has_room은 이미 authenticated에 직접 부여)
--   검사 제약(inquiries·conversations·shop_channels): is_encrypted, is_hmac — 행을 쓰는 역할의 권한으로 돈다
--   security_invoker 뷰 customer_consent_state: is_minor, setting_int (instructor_assignments 뷰의 my_instructor_id는 위에 있음)
--   invoker 함수가 부름: create_job → check_won, revisit_candidates → season_of (require_guardian 트리거 → is_minor)
-- 트리거 함수는 실행할 때 EXECUTE를 검사하지 않는다(만들 때만). 트리거 안에서 부르는 함수는 트리거 함수가 security definer면 소유자 권한.
-- 영향: 권한만 바꾼다. 데이터 변경 없음.
-- 앞으로: 새 private 함수도 기본값으로 PUBLIC 실행이 붙는다. supabase/tests/private_function_grants.test.sql이 CI에서 잡는다.
--   새 함수를 만들면 같은 마이그레이션에서 revoke execute on function private.<함수>(…) from public;
--   (정책·검사 제약·invoker 뷰에서 쓰면 grant execute … to authenticated, 서버가 쓰면 to service_role)
--
-- 되돌리기(필요할 때만). 적용 전 상태(PUBLIC 실행 65개, 시퀀스 anon UPDATE)로 돌린다:
--   do $$ declare f text; begin
--     foreach f in array array[
--     'private.is_platform_admin()',
--     'private.is_shop_member(uuid)',
--     'private.is_shop_owner(uuid)',
--     'private.is_any_shop_member()',
--     'private.shares_shop(uuid)',
--     'private.is_lesson_team_member()',
--     'private.is_lesson_team(uuid)',
--     'private.my_instructor_id()',
--     'private.is_instructor_user(uuid)',
--     'private.is_exclusive()',
--     'private.job_shop_id(uuid)',
--     'private.job_open_for_bids(uuid,boolean)',
--     'private.is_assigned(uuid)',
--     'private.has_job_link(uuid)',
--     'private.customer_shop_id(uuid)',
--     'private.settlement_shop_id(uuid)',
--     'private.can_see_settlement(uuid)',
--     'private.guard_admin_columns()',
--     'private.guard_assignment_columns()',
--     'private.add_shop_owner()',
--     'private.handle_new_user()',
--     'private.is_exclusive_instructor(uuid)',
--     'private.is_approved_shop(uuid)',
--     'private.has_time_conflict(uuid,timestamp with time zone,timestamp with time zone,uuid)',
--     'private.guard_assignment_overlap()',
--     'private.guard_job_time_overlap()',
--     'private.penalty_points_for(timestamp with time zone)',
--     'private.withholding_amount(integer,boolean)',
--     'private.track_consent()',
--     'private.my_lesson_team()',
--     'private.setting_int(text)',
--     'private.consents_immutable()',
--     'private.is_minor(integer)',
--     'private.require_guardian()',
--     'private.token_hash(text)',
--     'private.new_token()',
--     'private.registration_shop(text)',
--     'private.access_logs_immutable()',
--     'private.season_of(timestamp with time zone)',
--     'private.ai_feature_known(text)',
--     'private.ai_quota_ok(uuid)',
--     'private.ai_month_cost()',
--     'private.guard_cert_ai()',
--     'private.guard_cert_ai_insert()',
--     'private.clear_summary_on_anonymize()',
--     'private.notify_platform_admins(text,jsonb)',
--     'private.ops_check_alerts()',
--     'private.ai_usage_fail_check()',
--     'private.check_won(integer,text,integer)',
--     'private.may_bypass_guard()',
--     'private.guard_approved_job()',
--     'private.guard_approved_assignment()',
--     'private.guard_shop_identity()',
--     'private.limit_bids()',
--     'private.limit_job_offers()',
--     'private.audit_events_immutable()',
--     'private.audit_assignments()',
--     'private.audit_bids()',
--     'private.audit_jobs()',
--     'private.audit_settlements()',
--     'private.audit_penalties()',
--     'private.is_encrypted(text)',
--     'private.is_hmac(text)',
--     'private.touch_updated_at()',
--     'private.consult_seed_trigger()'
--     ] loop execute format('grant execute on function %s to public', f); end loop;
--   end $$;
--   grant update on all sequences in schema public to anon;

do $$
declare
  f record;
  auth_fns text[] := array[
    'private.is_platform_admin()', 'private.is_shop_member(uuid)', 'private.is_shop_owner(uuid)', 'private.is_any_shop_member()',
    'private.shares_shop(uuid)', 'private.is_lesson_team_member()', 'private.is_lesson_team(uuid)', 'private.my_instructor_id()',
    'private.is_instructor_user(uuid)', 'private.is_exclusive()', 'private.job_shop_id(uuid)', 'private.job_open_for_bids(uuid,boolean)',
    'private.is_assigned(uuid)', 'private.has_job_link(uuid)', 'private.customer_shop_id(uuid)', 'private.can_see_settlement(uuid)',
    'private.is_exclusive_instructor(uuid)', 'private.is_approved_shop(uuid)',
    'private.is_encrypted(text)', 'private.is_hmac(text)',
    'private.is_minor(integer)', 'private.setting_int(text)',
    'private.check_won(integer,text,integer)', 'private.season_of(timestamp with time zone)'];
  a text;
begin
  -- 지금 PUBLIC으로 실행되는 함수(ACL이 비어 있는 = 기본값)만 고른다. 이미 직접 관리하는 함수(consult_* 등)는 건드리지 않는다.
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
                  where x.grantee = 0 and x.privilege_type = 'EXECUTE')
  loop
    execute format('grant execute on function %s to service_role', f.sig);
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
  foreach a in array auth_fns loop
    execute format('grant execute on function %s to authenticated', a::regprocedure);
  end loop;
end $$;

revoke update on all sequences in schema public from anon;
