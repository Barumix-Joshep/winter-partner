-- 로컬 개발용 샘플 데이터 (npx supabase db reset 때만 들어간다. 원격에는 넣지 않는다)
-- 모든 계정 비밀번호: winter1234
-- 스키장·종목은 마이그레이션 0002에 있다.

-- 계정 ------------------------------------------------------------------
with u(id, email) as (values
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'admin@winter.test'),
  ('a0000000-0000-0000-0000-000000000011'::uuid, 'shop1@winter.test'),
  ('a0000000-0000-0000-0000-000000000012'::uuid, 'shop2@winter.test'),
  ('a0000000-0000-0000-0000-000000000013'::uuid, 'team@winter.test'),
  ('a0000000-0000-0000-0000-000000000021'::uuid, 'kim@winter.test'),
  ('a0000000-0000-0000-0000-000000000022'::uuid, 'lee@winter.test'),
  ('a0000000-0000-0000-0000-000000000023'::uuid, 'park@winter.test'),
  ('a0000000-0000-0000-0000-000000000024'::uuid, 'excl@winter.test')
), ins as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
         extensions.crypt('winter1234', extensions.gen_salt('bf')), now(),
         '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  from u
  returning id, email
)
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, json_build_object('sub', id::text, 'email', email)::jsonb, 'email', now(), now(), now()
from ins;

insert into profiles (id, role, name, phone) values
  ('a0000000-0000-0000-0000-000000000001', 'platform_admin', '본사 운영자', null),
  ('a0000000-0000-0000-0000-000000000011', 'shop_admin', '최렌탈', '010-0000-0011'),
  ('a0000000-0000-0000-0000-000000000012', 'shop_admin', '정렌탈', '010-0000-0012'),
  ('a0000000-0000-0000-0000-000000000013', 'shop_admin', '한팀장', '010-0000-0013'),
  ('a0000000-0000-0000-0000-000000000021', 'instructor', '김스키', '010-0000-0021'),
  ('a0000000-0000-0000-0000-000000000022', 'instructor', '이보드', '010-0000-0022'),
  ('a0000000-0000-0000-0000-000000000023', 'instructor', '박스키', '010-0000-0023'),
  ('a0000000-0000-0000-0000-000000000024', 'instructor', '오전속', '010-0000-0024');

-- 샵·강습팀 ---------------------------------------------------------------
insert into shops (id, type, name, business_no, owner_name, status, created_by) values
  ('b0000000-0000-0000-0000-000000000001', 'rental_shop', '하이원 스노우렌탈', '000-00-00001', '최렌탈', 'approved', 'a0000000-0000-0000-0000-000000000011'),
  ('b0000000-0000-0000-0000-000000000002', 'rental_shop', '용평 알파인샵', '000-00-00002', '정렌탈', 'approved', 'a0000000-0000-0000-0000-000000000012'),
  ('b0000000-0000-0000-0000-000000000003', 'lesson_team', '평창 라이딩스쿨', '000-00-00003', '한팀장', 'approved', 'a0000000-0000-0000-0000-000000000013');

insert into shop_members (shop_id, user_id, is_owner) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000011', true),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000012', true),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000013', true);

insert into shop_resorts (shop_id, resort_id)
select 'b0000000-0000-0000-0000-000000000001'::uuid, id from resorts where name = '하이원'
union all select 'b0000000-0000-0000-0000-000000000002', id from resorts where name = '용평'
union all select 'b0000000-0000-0000-0000-000000000003', id from resorts where name in ('용평', '휘닉스 평창');

-- 강사 ------------------------------------------------------------------
insert into instructors (id, user_id, level, bio, base_rate, cert_status) values
  ('c0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000021', 'KSIA Level 2', '초보·어린이 강습 7년', 80000, 'approved'),
  ('c0000000-0000-0000-0000-000000000022', 'a0000000-0000-0000-0000-000000000022', 'KSIA Level 1', '스노우보드 카빙 전문', 70000, 'approved'),
  ('c0000000-0000-0000-0000-000000000023', 'a0000000-0000-0000-0000-000000000023', null, '첫 시즌 강사', 60000, 'pending'),
  ('c0000000-0000-0000-0000-000000000024', 'a0000000-0000-0000-0000-000000000024', 'KSIA Level 2', '하이원 전속', 90000, 'approved');

insert into instructor_certs (instructor_id, issuer, grade, status, verified_at) values
  ('c0000000-0000-0000-0000-000000000021', 'KSIA', 'Level 2', 'approved', now()),
  ('c0000000-0000-0000-0000-000000000022', 'KSIA', 'Level 1', 'approved', now()),
  ('c0000000-0000-0000-0000-000000000023', 'KSIA', 'Level 1', 'pending', null),
  ('c0000000-0000-0000-0000-000000000024', 'KSIA', 'Level 2', 'approved', now());

insert into instructor_sports (instructor_id, sport_id)
select 'c0000000-0000-0000-0000-000000000021'::uuid, id from sports where name = '스키'
union all select 'c0000000-0000-0000-0000-000000000022', id from sports where name = '스노우보드'
union all select 'c0000000-0000-0000-0000-000000000023', id from sports where name = '스키'
union all select 'c0000000-0000-0000-0000-000000000024', id from sports;

insert into instructor_resorts (instructor_id, resort_id)
select 'c0000000-0000-0000-0000-000000000021'::uuid, id from resorts where name in ('하이원', '용평')
union all select 'c0000000-0000-0000-0000-000000000022', id from resorts where name in ('용평', '휘닉스 평창')
union all select 'c0000000-0000-0000-0000-000000000023', id from resorts where name = '하이원'
union all select 'c0000000-0000-0000-0000-000000000024', id from resorts where name = '하이원';

-- 오전속은 하이원 스노우렌탈 전속 (입찰 공고를 볼 수 없다)
insert into shop_instructors (shop_id, instructor_id, exclusive_rate) values
  ('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000024', 90000);

insert into availability (instructor_id, starts_at, ends_at) values
  ('c0000000-0000-0000-0000-000000000021', '2026-12-19 09:00+09', '2026-12-19 17:00+09'),
  ('c0000000-0000-0000-0000-000000000021', '2026-12-20 09:00+09', '2026-12-20 17:00+09'),
  ('c0000000-0000-0000-0000-000000000022', '2026-12-20 09:00+09', '2026-12-20 17:00+09');

-- 손님 (가상 번호) ----------------------------------------------------------
insert into customers (id, shop_id, name, phone, level, equipment_size, tags, marketing_consent, consent_at) values
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '손님 하나', '010-0000-1001', '초급', '150cm', '{가족}', true, now()),
  ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', '손님 둘', '010-0000-1002', '입문', '120cm', '{어린이}', false, null),
  ('d0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', '손님 셋', '010-0000-1003', '중급', '158cm', '{}', false, null);

-- 강습 ------------------------------------------------------------------
insert into jobs (id, shop_id, resort_id, sport_id, starts_at, ends_at, lesson_type, student_count,
                  instructor_rate, patch_paid_by, assign_mode, allow_team_bids, bid_closes_at, status, note) values
  -- 직접 의뢰 → 김스키 배정 완료
  ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   (select id from resorts where name = '하이원'), (select id from sports where name = '스키'),
   '2026-12-19 10:00+09', '2026-12-19 12:00+09', 'private', 1, 80000, 'shop', 'direct', false, null, 'assigned', '첫 강습, 겁이 많음'),
  -- 직접 의뢰 → 김스키 응답 대기
  ('e0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
   (select id from resorts where name = '하이원'), (select id from sports where name = '스키'),
   '2026-12-20 13:00+09', '2026-12-20 15:00+09', 'semi', 2, 120000, 'customer', 'direct', false, null, 'open', null),
  -- 공개 입찰 (팀 입찰 허용)
  ('e0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002',
   (select id from resorts where name = '용평'), (select id from sports where name = '스노우보드'),
   '2026-12-20 10:00+09', '2026-12-20 12:00+09', 'group', 4, 200000, 'shop', 'bid', true, '2026-12-18 18:00+09', 'open', '중급 그룹');

insert into job_prices (job_id, customer_price) values
  ('e0000000-0000-0000-0000-000000000001', 150000),
  ('e0000000-0000-0000-0000-000000000002', 220000),
  ('e0000000-0000-0000-0000-000000000003', 360000);

insert into job_customers (job_id, customer_id) values
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002'),
  ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003');

insert into job_offers (job_id, instructor_id, status, responded_at) values
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000021', 'accepted', now()),
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000021', 'pending', null);

insert into assignments (job_id, instructor_id, final_rate) values
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000021', 80000);

insert into bids (job_id, bidder_type, instructor_id, bidder_shop_id, amount, memo) values
  ('e0000000-0000-0000-0000-000000000003', 'instructor', 'c0000000-0000-0000-0000-000000000022', null, 180000, '카빙 위주로 진행'),
  ('e0000000-0000-0000-0000-000000000003', 'shop', null, 'b0000000-0000-0000-0000-000000000003', 190000, '강사 2명 투입');
