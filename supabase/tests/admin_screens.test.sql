-- P21-15 본사 화면 회귀 시험 (pgTAP). 본사 화면(/admin, /admin/ai, /admin/ai/consult, 자격증 검증, 피드백, 접속 기록)이
-- 로그인 사용자 권한(authenticated + 본사 세션)으로 읽고 쓰는 표·RPC를 화면 코드와 같은 열·인자로 부른다.
-- 권한 정리(P21-12 표 쓰기, P21-13 private 함수, P21-14 MAINTAIN·스키마 USAGE·시퀀스)나 앞으로의 회수가 본사 화면을 깨면 여기서 잡는다.
-- 화면 코드의 질의를 바꾸면 이 파일도 같이 고친다(src/app/admin/**).
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000015aa', 'screens-admin@t');
insert into profiles (id, role, name) values ('00000000-0000-0000-0000-0000000015aa', 'platform_admin', '본사');
insert into feedback (page_path, body) values ('/admin-screens', '시험 피드백');
insert into shop_change_requests (shop_id, new_business_no, old_type, old_business_no)
values ('b0000000-0000-0000-0000-000000000002', '999-99-15151', 'rental_shop', '000-00-00002');

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- 본사 판별의 토대(정책·검사·RPC가 모두 이것을 부른다)
select ok(has_schema_privilege('authenticated', 'private', 'USAGE'), 'authenticated는 private 스키마 USAGE가 있다');
select ok(has_function_privilege('authenticated', 'private.is_platform_admin()', 'EXECUTE'), 'authenticated는 is_platform_admin을 실행할 수 있다');

select pg_temp.as_user('00000000-0000-0000-0000-0000000015aa');
select ok(private.is_platform_admin(), '본사 세션에서 is_platform_admin = true');

-- 표: 화면 코드와 같은 열 (/admin 첫 화면)
select ok((select count(*) from shop_change_requests r left join shops s on s.id = r.shop_id
           where r.new_business_no = '999-99-15151' and s.name is not null) = 1,
  '샵 변경 요청 + 샵 이름(admin/page.tsx)');
select lives_ok($$select r.id, r.new_type, r.new_business_no, r.old_type, r.old_business_no, r.requested_at from shop_change_requests r$$, '샵 변경 요청 열');
select ok((select count(*) from instructor_certs c join instructors i on i.id = c.instructor_id join profiles p on p.id = i.user_id) > 0,
  '자격증 + 강사 + 이름(자격증 검증 화면)');
select lives_ok($$select id, issuer, grade, file_url, ai_extract from instructor_certs$$, '자격증 열');
select lives_ok($$select id, name from storage.objects where bucket_id = 'certs'$$, '자격증 파일 조회(서명 URL 만들기 전)');
-- /admin/feedback, /admin/access-logs, /admin/ai
select ok((select count(*) from feedback where page_path = '/admin-screens') = 1, '피드백을 본다');
select lives_ok($$select id, role, page_path, body, contact, status, admin_note, created_at from feedback$$, '피드백 열(admin_note 포함)');
select lives_ok($$select id, shop_id, actor_name, action, target_id, detail, created_at from access_logs$$, '접속 기록 열');
select ok((select count(*) from shops) >= 3, '본사는 모든 샵을 본다');
select lives_ok($$select feature, ok, cost_krw from ai_usage where created_at >= date_trunc('month', now())$$, 'AI 사용량 열');
-- /admin/ai/consult (사용권 관리)
select ok((select count(*) from consult_plans) >= 1, '상담 요금제를 본다');
select lives_ok($$select daily_cap from consult_licenses$$, '사용권 하루 상한 열(열 단위 권한)');
select lives_ok($$select id, action, actor_id, detail, created_at from audit_events$$, '감사 기록 열');
select lives_ok($$select id, name from profiles$$, '처리한 사람 이름');

-- 읽기 RPC
select lives_ok($$select * from admin_ops_summary()$$, 'admin_ops_summary');
select lives_ok($$select * from admin_anomalies()$$, 'admin_anomalies');
select lives_ok($$select * from admin_instructor_activity('c0000000-0000-0000-0000-000000000021')$$, 'admin_instructor_activity');
select lives_ok($$select * from admin_metric('active_shops', date_trunc('month', now())::date)$$, 'admin_metric');
select lives_ok($$select * from admin_pilot_metrics()$$, 'admin_pilot_metrics');
select lives_ok($$select * from ai_admin_settings()$$, 'ai_admin_settings');
select lives_ok($$select * from consult_admin_metrics(now() - interval '30 days', now())$$, 'consult_admin_metrics');
select lives_ok($$select * from consult_admin_shop_costs(now() - interval '30 days', now())$$, 'consult_admin_shop_costs');
select lives_ok($$select * from consult_admin_license_overview(to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM'))$$, 'consult_admin_license_overview');

-- 쓰기 RPC (이 파일은 끝에서 rollback)
select lives_ok($$select set_feedback_status((select id from feedback where page_path = '/admin-screens'), 'done', '확인')$$, 'set_feedback_status');
select lives_ok($$select set_ai_default('bid_assist', true)$$, 'set_ai_default');
select lives_ok($$select review_cert((select id from instructor_certs where status = 'pending' limit 1), true)$$, 'review_cert(자격증 승인)');
select lives_ok($$select decide_shop_change((select id from shop_change_requests where new_business_no = '999-99-15151'), false)$$, 'decide_shop_change');
select lives_ok($$select consult_admin_grant_license('b0000000-0000-0000-0000-000000000002')$$, 'consult_admin_grant_license');

-- 대조: 샵 관리자는 같은 RPC를 못 부른다
select pg_temp.as_user('a0000000-0000-0000-0000-000000000011');
select throws_ok($$select * from ai_admin_settings()$$, '42501', null, '샵 관리자는 ai_admin_settings 거부');
select throws_ok($$select * from consult_admin_license_overview(to_char(now(), 'YYYY-MM'))$$, '42501', null, '샵 관리자는 사용권 현황 거부');

select * from finish();
rollback;
