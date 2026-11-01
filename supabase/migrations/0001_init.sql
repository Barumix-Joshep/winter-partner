-- 겨울파트너 초기 스키마 (기획서 "데이터 모델과 권한" 기준)
create extension if not exists "pgcrypto";

-- 공용 기준 정보 -------------------------------------------------------
create table resorts (
  id serial primary key,
  name text not null,
  region text not null,
  active boolean not null default true
);

create table sports (
  id serial primary key,
  name text not null unique
);

-- 사용자 역할 ----------------------------------------------------------
create type user_role as enum ('platform_admin', 'shop_admin', 'instructor');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  name text not null,
  phone text,
  created_at timestamptz not null default now()
);

-- 테넌트: 렌탈샵 / 강습 전문팀 ----------------------------------------
create type shop_type as enum ('rental_shop', 'lesson_team');
create type approval_status as enum ('pending', 'approved', 'rejected');

create table shops (
  id uuid primary key default gen_random_uuid(),
  type shop_type not null default 'rental_shop',
  name text not null,
  business_no text,
  owner_name text,
  status approval_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table shop_members (
  shop_id uuid references shops(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  is_owner boolean not null default false,
  primary key (shop_id, user_id)
);

create table shop_resorts (
  shop_id uuid references shops(id) on delete cascade,
  resort_id int references resorts(id),
  primary key (shop_id, resort_id)
);

-- 강사 ------------------------------------------------------------------
create table instructors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references profiles(id) on delete cascade,
  level text,
  bio text,
  photo_url text,
  base_rate int,
  cert_status approval_status not null default 'pending',
  penalty_points int not null default 0,
  created_at timestamptz not null default now()
);

create table instructor_certs (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid references instructors(id) on delete cascade,
  issuer text not null,          -- KSIA 등
  grade text,
  file_url text,
  status approval_status not null default 'pending',
  verified_at timestamptz
);

create table instructor_sports (
  instructor_id uuid references instructors(id) on delete cascade,
  sport_id int references sports(id),
  primary key (instructor_id, sport_id)
);

create table instructor_resorts (
  instructor_id uuid references instructors(id) on delete cascade,
  resort_id int references resorts(id),
  primary key (instructor_id, resort_id)
);

create table availability (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid references instructors(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  check (ends_at > starts_at)
);

-- 전속 관계: 한 강사는 한 샵에만 전속. 전속이면 프리랜서 공고를 볼 수 없다.
create table shop_instructors (
  shop_id uuid references shops(id) on delete cascade,
  instructor_id uuid unique references instructors(id) on delete cascade,
  exclusive_rate int,
  joined_at timestamptz not null default now(),
  primary key (shop_id, instructor_id)
);

-- 손님 (샵 격리) --------------------------------------------------------
create table customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  phone text,
  guardian_phone text,
  level text,
  equipment_size text,
  tags text[] not null default '{}',
  owner_user_id uuid references profiles(id),
  next_contact_on date,
  marketing_consent boolean not null default false,
  consent_at timestamptz,
  created_at timestamptz not null default now()
);

create table customer_links (
  customer_id uuid references customers(id) on delete cascade,
  linked_customer_id uuid references customers(id) on delete cascade,
  primary key (customer_id, linked_customer_id)
);

create table inquiries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  channel text,
  outcome text,
  lost_reason text,
  created_at timestamptz not null default now()
);

-- 강습 ------------------------------------------------------------------
create type job_status as enum ('draft', 'open', 'assigned', 'done', 'approved', 'canceled');
create type assign_mode as enum ('direct', 'bid');
create type lesson_type as enum ('private', 'semi', 'group');

create table jobs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  resort_id int references resorts(id),
  sport_id int references sports(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  lesson_type lesson_type not null default 'private',
  student_count int not null default 1,
  customer_price int,             -- 손님 강습료 (샵만 봄)
  instructor_rate int,            -- 강사 지급 예정액 / 입찰 상한
  patch_paid_by text,             -- shop / instructor / customer
  assign_mode assign_mode not null default 'direct',
  allow_team_bids boolean not null default false,
  bid_closes_at timestamptz,
  status job_status not null default 'draft',
  note text,
  canceled_by text,               -- customer / instructor / shop
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table job_customers (
  job_id uuid references jobs(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  primary key (job_id, customer_id)
);

create type offer_status as enum ('pending', 'accepted', 'declined', 'expired');

create table job_offers (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  instructor_id uuid references instructors(id) on delete cascade,
  status offer_status not null default 'pending',
  expires_at timestamptz,
  responded_at timestamptz,
  unique (job_id, instructor_id)
);

create type bid_status as enum ('open', 'selected', 'rejected', 'withdrawn');
create type bidder_type as enum ('instructor', 'shop');

create table bids (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  bidder_type bidder_type not null default 'instructor',
  instructor_id uuid references instructors(id) on delete cascade,
  bidder_shop_id uuid references shops(id) on delete cascade,
  amount int not null,
  memo text,
  status bid_status not null default 'open',
  created_at timestamptz not null default now(),
  check ((bidder_type = 'instructor' and instructor_id is not null) or (bidder_type = 'shop' and bidder_shop_id is not null))
);

create table assignments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid unique references jobs(id) on delete cascade,
  instructor_id uuid references instructors(id),
  via_shop_id uuid references shops(id),      -- 팀 입찰로 배정된 경우
  final_rate int not null,
  completed_at timestamptz,
  lesson_note text,                           -- 강사 노트 (다음 강습 참고)
  approved_at timestamptz,
  approved_by uuid references profiles(id)
);

-- 정산 ------------------------------------------------------------------
create type pay_status as enum ('draft', 'issued', 'paid');

create table settlements (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  instructor_id uuid references instructors(id),
  payee_shop_id uuid references shops(id),    -- 팀에게 지급하는 경우
  month date not null,                        -- 해당 월 1일
  gross int not null default 0,
  withholding int not null default 0,         -- 3.3%
  net int not null default 0,
  status pay_status not null default 'draft',
  paid_at timestamptz,
  unique (shop_id, instructor_id, payee_shop_id, month)
);

create table settlement_items (
  settlement_id uuid references settlements(id) on delete cascade,
  assignment_id uuid references assignments(id) on delete cascade,
  amount int not null,
  primary key (settlement_id, assignment_id)
);

create table ratings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  from_role user_role not null,
  to_instructor_id uuid references instructors(id),
  to_shop_id uuid references shops(id),
  score int not null check (score between 1 and 5),
  memo text,
  created_at timestamptz not null default now()
);

create table instructor_penalties (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid references instructors(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  reason text not null,
  points int not null default 1,
  created_at timestamptz not null default now()
);

-- 알림 ------------------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  channel text not null default 'push',       -- push / alimtalk
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- 인덱스 ----------------------------------------------------------------
create index on jobs (shop_id, starts_at);
create index on jobs (status) where status = 'open';
create index on assignments (instructor_id);
create index on customers (shop_id, name);
create index on bids (job_id);
create index on availability (instructor_id, starts_at);
