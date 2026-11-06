-- P23-2 AI 상담 사용권 (docs/ai-consult/paid-service-design.md 2~4·7절, 9절 결정)
-- 목적: AI 상담을 별도 유료 서비스로 나눈다. 본사가 샵별 "AI 상담 사용권"을 줘야 AI 상담(자동응답·사장님 초안·인스타 새 연결)을 쓴다.
--   청구는 앱 밖에서 수동으로 하고(결제 연동 없음), DB는 사용권·사용량만 관리한다.
-- 만드는 것:
--   - 표 3개: consult_plans(요금제, 임시안 standard_v1 1행) · consult_licenses(샵당 1행) · consult_usage_packs(추가 팩, 그 달만)
--     쓰기는 본사 RPC로만(로그인 사용자 insert·update·delete·truncate·references·trigger 회수). 샵은 자기 행만 읽고 admin_note는 못 읽는다(열 권한).
--   - 판정 private.consult_license_ok(샵, 시각): ok / no_license / suspended / not_started / expired.
--     체험 10일은 한국 날짜 기준(시작일 포함 10일째 24시, Q2). 첫 자동응답 전 대기는 부여 뒤 trial_wait_days(14일)까지(Q3),
--     그 뒤에는 시작 = 부여 + 14일로 보고 판정한다(정리 작업이 starts_at을 채우기 전에도 같은 결과).
--   - 월 응답 건수(Q1) = 그 한국 달 ai_usage feature 'consult', ok = true 행 수. 한도 = 사용권 포함량 + 그 달 팩 합계(Q6).
--   - 체험 시작 트리거: messages에 AI 답이 'sent'로 남으면(첫 자동응답) 체험 시계를 시작한다(감사 consult_trial_started).
--   - 켜짐 스위치 app_settings.consult_license_required = false. **false면 ai_gate·set_consult_settings·consult_connect_instagram·
--     consult_license_check·consult_license_sweep(중지·알림)이 사용권을 보지 않는다 → 적용해도 지금 동작 그대로.**
--     true면: ai_gate(consult) no_license·monthly_quota, 자동응답 켜기 거부(끄기는 허용), 인스타 새 연결 거부, 정리 작업이 끝난 사용권 중지·알림.
--   - 다시 정의(기존 본문 그대로 + 확인 추가): public.ai_gate, public.set_consult_settings, private.consult_quota_ok(사용권 daily_cap),
--     public.consult_connect_instagram.
--   - 새 함수: 본사 RPC 7개(consult_admin_grant_license·set_paid·extend·suspend·add_pack·set_quota·create_plan),
--     consult_admin_license_overview(본사 표), consult_my_usage(샵 화면), consult_license_check(웹훅, 서버 전용),
--     consult_license_sweep(매일 정리 작업, 서버 전용).
-- 영향(데이터 변경):
--   - consult_plans 1행(standard_v1: 59,000원 부가세 별도·월 2,000건·초과 block·팩 1,000건 19,000원·체험 10일·대기 14일·만료 알림 3일, 모두 임시안)
--   - private.app_settings 키 1개(consult_license_required = false)
--   - 자동 이행(7-2): auto_reply_enabled = true 이거나 shop_channels.enabled = true 인 샵에 standard_v1 체험(첫 자동응답 기준) 1행씩.
--     이미 자동응답이 나간 샵은 시작 = 적용 시각. 감사 consult_license_granted {"migration": true}. 2026-11-06 문서 기준 운영 대상 0곳.
--   - 기존 표의 행은 바꾸지 않는다.
--
-- 되돌리기:
--   drop trigger consult_trial_start on public.messages;
--   drop function public.consult_license_sweep(), public.consult_license_check(uuid), public.consult_my_usage(uuid),
--     public.consult_admin_license_overview(text), public.consult_admin_grant_license(uuid, text, timestamptz, uuid, text),
--     public.consult_admin_set_paid(uuid, timestamptz, timestamptz, text), public.consult_admin_extend(uuid, timestamptz, text),
--     public.consult_admin_suspend(uuid, text, text), public.consult_admin_add_pack(uuid, text, int), public.consult_admin_set_quota(uuid, int, int),
--     public.consult_admin_create_plan(text, text, int, int, text, int, int, int, int, int, uuid);
--   drop function private.consult_trial_start(), private.consult_license_migrate(), private.consult_notify(uuid, text, jsonb, boolean, text),
--     private.consult_license_block(uuid), private.consult_license_ok(uuid, timestamptz), private.consult_license_window(uuid, timestamptz),
--     private.consult_month_used(uuid, timestamptz), private.consult_month_limit(uuid, timestamptz), private.consult_license_required(),
--     private.consult_kst_month_start(timestamptz, int), private.consult_kst_day_end(timestamptz, int), private.consult_admin_only();
--   ai_gate·consult_quota_ok·set_consult_settings는 20261105114656_consult_schema.sql 정의로, consult_connect_instagram은
--   20261105133519_consult_instagram.sql 정의로 다시 만든다(create or replace, 권한은 그대로 남는다);
--   drop table public.consult_usage_packs, public.consult_licenses, public.consult_plans;
--   delete from private.app_settings where key = 'consult_license_required';
--   (감사 기록 audit_events의 consult_license_* 행은 고칠 수 없는 표라 남는다. 알림 notifications의 consult_* 행은 지워도 된다)

-- 요금제 ------------------------------------------------------------------
create table public.consult_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]{1,40}$'),
  name text not null check (length(btrim(name)) between 1 and 60),
  monthly_price_krw int not null check (monthly_price_krw between 0 and 100000000), -- 표시·청구 참고용. 앱은 돈을 받지 않는다
  vat_included boolean not null default false,
  included_monthly_responses int not null check (included_monthly_responses between 1 and 1000000),
  overage_policy text not null default 'block' check (overage_policy in ('block', 'allow')),
  pack_size int not null check (pack_size between 1 and 1000000),
  pack_price_krw int not null check (pack_price_krw between 0 and 100000000),
  trial_days int not null default 10 check (trial_days between 1 and 90),
  trial_wait_days int not null default 14 check (trial_wait_days between 1 and 90),
  expiry_notice_days int not null default 3 check (expiry_notice_days between 0 and 30),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

-- 샵별 사용권 (샵당 1행, 이력은 audit_events)
create table public.consult_licenses (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  plan_id uuid not null references public.consult_plans(id),
  status text not null check (status in ('trial', 'paid', 'suspended')),
  start_mode text not null default 'first_auto_reply' check (start_mode in ('first_auto_reply', 'fixed')),
  starts_at timestamptz,
  ends_at timestamptz,
  included_monthly_responses int not null check (included_monthly_responses between 1 and 1000000), -- 부여 때 요금제에서 복사
  overage_policy text not null check (overage_policy in ('block', 'allow')),
  daily_cap int check (daily_cap between 1 and 10000), -- null이면 ai_consult_daily_calls_per_shop(300)
  suspended_reason text check (suspended_reason in ('trial_ended', 'expired', 'admin', 'unpaid', 'terminated')),
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  admin_note text check (length(admin_note) <= 500), -- 본사 메모. 샵은 못 읽는다(열 권한), 감사 기록에도 넣지 않는다
  notice_sent_for timestamptz, -- 만료 알림을 보낸 ends_at(같은 종료일에 한 번만)
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check ((status = 'suspended') = (suspended_reason is not null))
);
create index on public.consult_licenses (plan_id);

-- 추가 팩 (그 한국 달에만)
create table public.consult_usage_packs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  responses int not null check (responses between 1 and 1000000),
  price_krw int not null check (price_krw between 0 and 1000000000),
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.consult_usage_packs (shop_id, month);

-- RLS·권한 (P21-11: 쓰기 권한은 표마다 명시적으로 회수, 필요한 읽기만 준다)
alter table public.consult_plans enable row level security;
alter table public.consult_licenses enable row level security;
alter table public.consult_usage_packs enable row level security;
revoke all on public.consult_plans, public.consult_licenses, public.consult_usage_packs from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.consult_plans from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.consult_licenses from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.consult_usage_packs from public, anon, authenticated;
grant select on public.consult_plans, public.consult_usage_packs to authenticated;
grant select (shop_id, plan_id, status, start_mode, starts_at, ends_at, included_monthly_responses, overage_policy, daily_cap,
              suspended_reason, granted_by, granted_at, updated_by, updated_at, notice_sent_for)
  on public.consult_licenses to authenticated;

create policy member_read on public.consult_licenses for select to authenticated using (private.is_shop_member(shop_id));
create policy platform_admin_read on public.consult_licenses for select to authenticated using (private.is_platform_admin());
create policy member_read on public.consult_usage_packs for select to authenticated using (private.is_shop_member(shop_id));
create policy platform_admin_read on public.consult_usage_packs for select to authenticated using (private.is_platform_admin());
-- 요금제: 샵은 자기 사용권의 요금제만, 본사는 전체
create policy member_read on public.consult_plans for select to authenticated
  using (exists (select 1 from public.consult_licenses l where l.plan_id = consult_plans.id and private.is_shop_member(l.shop_id)));
create policy platform_admin_read on public.consult_plans for select to authenticated using (private.is_platform_admin());

-- 임시안 요금제 (값은 코드에 두지 않는다. 바꿀 때는 새 행 + 옛 행 끄기)
insert into public.consult_plans (code, name, monthly_price_krw, vat_included, included_monthly_responses, overage_policy,
                                  pack_size, pack_price_krw, trial_days, trial_wait_days, expiry_notice_days)
values ('standard_v1', 'AI 상담 기본', 59000, false, 2000, 'block', 1000, 19000, 10, 14, 3);

-- 켜짐 스위치 (기본 false = 지금 동작 그대로). 사장님이 SQL Editor에서 true로 바꾼다. 되돌리기도 이 값 하나
insert into private.app_settings (key, value, note) values
  ('consult_license_required', 'false', 'AI 상담 사용권 강제(true면 사용권 없는 샵은 AI 상담 꺼짐). P23-2');

-- 판정 도움 함수 ----------------------------------------------------------
create function private.consult_license_required() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::boolean from private.app_settings where key = 'consult_license_required'), false)
$$;

-- 시작 시각의 한국 날짜 + n일의 0시(KST). 체험 10일: 11/10 14시 시작 → 11/20 0시 KST 끝(Q2)
create function private.consult_kst_day_end(p_start timestamptz, p_days int) returns timestamptz
language sql stable set search_path = '' as $$
  select ((((p_start at time zone 'Asia/Seoul')::date + p_days)::timestamp) at time zone 'Asia/Seoul')
$$;

-- p_at이 든 한국 달의 1일 0시 (+ p_offset달)
create function private.consult_kst_month_start(p_at timestamptz, p_offset int default 0) returns timestamptz
language sql stable set search_path = '' as $$
  select ((date_trunc('month', p_at at time zone 'Asia/Seoul') + make_interval(months => p_offset)) at time zone 'Asia/Seoul')
$$;

-- 사용권의 실제 시작·끝 (대기 14일이 지난 체험은 시작 = 부여 + 14일로 계산)
create function private.consult_license_window(p_shop uuid, p_at timestamptz default now(),
  out w_status text, out w_starts timestamptz, out w_ends timestamptz, out w_wait_until timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare l public.consult_licenses; p public.consult_plans;
begin
  select * into l from public.consult_licenses where shop_id = p_shop;
  if l.shop_id is null then return; end if;
  w_status := l.status; w_starts := l.starts_at; w_ends := l.ends_at;
  if l.status = 'trial' and l.starts_at is null then
    select * into p from public.consult_plans where id = l.plan_id;
    w_wait_until := l.granted_at + make_interval(days => p.trial_wait_days);
    if p_at >= w_wait_until then
      w_starts := w_wait_until;
      w_ends := private.consult_kst_day_end(w_wait_until, p.trial_days);
    end if;
  end if;
end $$;

-- 사용권 판정: 'ok' 또는 막는 이유. 끝나는 시각은 호출 때마다 비교한다(정리 작업 전이라도 바로 막힘)
create function private.consult_license_ok(p_shop uuid, p_at timestamptz default now()) returns text
language plpgsql stable security definer set search_path = '' as $$
declare w record;
begin
  select * into w from private.consult_license_window(p_shop, p_at);
  if w.w_status is null then return 'no_license'; end if;
  if w.w_status = 'suspended' then return 'suspended'; end if;
  if w.w_starts is null then return 'ok'; end if; -- 체험 대기(첫 자동응답 전, 14일 안)
  if w.w_starts > p_at then return 'not_started'; end if;
  if w.w_ends is not null and w.w_ends <= p_at then return 'expired'; end if;
  return 'ok';
end $$;

-- 이번 달 응답 건수(Q1): 그 한국 달 consult 성공 호출 수 (재시도의 실패 행은 빼고, 성공은 메시지당 1행)
create function private.consult_month_used(p_shop uuid, p_at timestamptz default now()) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.ai_usage
  where shop_id = p_shop and feature = 'consult' and ok
    and created_at >= private.consult_kst_month_start(p_at) and created_at < private.consult_kst_month_start(p_at, 1)
$$;

-- 이번 달 한도 = 사용권 포함량 + 그 달 팩 (사용권이 없으면 null)
create function private.consult_month_limit(p_shop uuid, p_at timestamptz default now()) returns int
language sql stable security definer set search_path = '' as $$
  select l.included_monthly_responses
         + coalesce((select sum(k.responses) from public.consult_usage_packs k
                     where k.shop_id = p_shop and k.month = to_char(p_at at time zone 'Asia/Seoul', 'YYYY-MM')), 0)::int
  from public.consult_licenses l where l.shop_id = p_shop
$$;

-- AI 상담을 막을 이유 (스위치 꺼짐이면 언제나 null = 막지 않음)
create function private.consult_license_block(p_shop uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_shop is null or not private.consult_license_required() then return null; end if;
  if private.consult_license_ok(p_shop) <> 'ok' then return 'no_license'; end if;
  if (select overage_policy from public.consult_licenses where shop_id = p_shop) = 'block'
     and private.consult_month_used(p_shop) >= private.consult_month_limit(p_shop) then
    return 'monthly_quota';
  end if;
  return null;
end $$;

-- 샵 멤버(+본사)에게 알림(앱 알림 목록 + 웹푸시는 notify/dispatch가 보낸다, Q11). p_once가 있으면 같은 사람·종류·샵·키로는 한 번만
create function private.consult_notify(p_shop uuid, p_kind text, p_payload jsonb, p_admins boolean, p_once text) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.notifications (user_id, kind, payload)
  select u.id, p_kind,
         coalesce(p_payload, '{}') || jsonb_build_object('shop_id', p_shop, 'shop_name', (select s.name from public.shops s where s.id = p_shop))
           || case when p_once is null then '{}'::jsonb else jsonb_build_object('once', p_once) end
           || case when u.admin then '{"admin": true}'::jsonb else '{}'::jsonb end -- 본사 알림은 본사 화면으로 연결
  from (select m.user_id as id, false as admin from public.shop_members m where m.shop_id = p_shop
        union
        select p.id, true from public.profiles p where p_admins and p.role = 'platform_admin') u
  where p_once is null
     or not exists (select 1 from public.notifications x
                    where x.user_id = u.id and x.kind = p_kind and x.payload ->> 'shop_id' = p_shop::text and x.payload ->> 'once' = p_once);
  get diagnostics n = row_count;
  return n;
end $$;

create function private.consult_admin_only() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then
    raise exception '플랫폼 관리자만 할 수 있습니다' using errcode = '42501';
  end if;
end $$;

revoke all on function private.consult_license_required() from public, anon, authenticated;
revoke all on function private.consult_kst_day_end(timestamptz, int) from public, anon, authenticated;
revoke all on function private.consult_kst_month_start(timestamptz, int) from public, anon, authenticated;
revoke all on function private.consult_license_window(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.consult_license_ok(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.consult_month_used(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.consult_month_limit(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.consult_license_block(uuid) from public, anon, authenticated;
revoke all on function private.consult_notify(uuid, text, jsonb, boolean, text) from public, anon, authenticated;
revoke all on function private.consult_admin_only() from public, anon, authenticated;

-- 체험 시계 시작: AI 답이 손님에게 나가면(role 'ai', 'sent') 대기 중 체험을 시작한다 ------------------
-- 카카오 즉답·콜백, 인스타 자동 발송이 모두 consult_record_reply로 이 표에 남는다(앱 경로를 빠뜨려도 시계는 돈다).
-- 대기 14일이 이미 지났으면 시작 = 부여 + 14일(판정 함수와 같은 시각).
create function private.consult_trial_start() returns trigger
language plpgsql security definer set search_path = '' as $$
declare l public.consult_licenses; p public.consult_plans; s timestamptz; e timestamptz;
begin
  select * into l from public.consult_licenses
   where shop_id = new.shop_id and status = 'trial' and start_mode = 'first_auto_reply' and starts_at is null
   for update;
  if l.shop_id is null then return null; end if;
  select * into p from public.consult_plans where id = l.plan_id;
  s := least(now(), l.granted_at + make_interval(days => p.trial_wait_days));
  e := private.consult_kst_day_end(s, p.trial_days);
  update public.consult_licenses set starts_at = s, ends_at = e, updated_at = now() where shop_id = l.shop_id;
  perform private.audit(l.shop_id, 'consult_trial_started', 'consult_licenses', l.shop_id,
    jsonb_build_object('by', case when s < now() then 'wait_elapsed' else 'first_auto_reply' end, 'starts_at', s, 'ends_at', e));
  return null;
end $$;
revoke all on function private.consult_trial_start() from public, anon, authenticated;
create trigger consult_trial_start after insert or update of delivery_status on public.messages
  for each row when (new.role = 'ai' and new.delivery_status = 'sent') execute function private.consult_trial_start();

-- 다시 정의: AI 게이트 (기존 본문 그대로 + 상담 사용권·월 포함량) ---------------------------------------
create or replace function public.ai_gate(p_shop_id uuid, p_feature text)
returns table (allowed boolean, reason text, model text)
language plpgsql security definer set search_path = '' as $$
declare
  m text := (select value #>> '{}' from private.app_settings
             where key = case when p_feature in ('cert', 'bid_assist') then 'ai_model_vision'
                              when p_feature = 'consult' then 'ai_model_consult' else 'ai_model_text' end);
  lic text;
begin
  if not private.ai_feature_known(p_feature) then
    raise exception '모르는 AI 기능입니다: %', p_feature using errcode = '22023';
  end if;
  if not coalesce(((select value from private.app_settings where key = 'ai_features') ->> p_feature)::boolean, false) then
    return query select false, 'platform_off'::text, m; return;
  end if;
  if p_shop_id is not null and coalesce(((select ai_features from public.shops where id = p_shop_id) ->> p_feature)::boolean, true) = false then
    return query select false, 'shop_off'::text, m; return;
  end if;
  -- P23-2 상담 사용권 (스위치 consult_license_required가 false면 lic는 언제나 null)
  if p_feature = 'consult' and p_shop_id is not null then
    lic := private.consult_license_block(p_shop_id);
    if lic = 'monthly_quota' then
      -- 이번 달 처음 막힐 때 샵·본사에 한 번 (정리 작업의 100% 알림과 같은 키)
      perform private.consult_notify(p_shop_id, 'consult_quota_reached',
        jsonb_build_object('month', to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM'),
                           'used', private.consult_month_used(p_shop_id), 'limit', private.consult_month_limit(p_shop_id)),
        true, to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM'));
    end if;
    if lic is not null then
      return query select false, lic, m; return;
    end if;
  end if;
  if p_shop_id is not null and not (case when p_feature = 'consult' then private.consult_quota_ok(p_shop_id) else private.ai_quota_ok(p_shop_id) end) then
    return query select false, 'daily_cap'::text, m; return;
  end if;
  if private.ai_month_cost() >= private.setting_int('ai_monthly_cap_krw') then
    -- 이번 달 처음 넘었을 때만 관리자에게 알린다
    insert into public.notifications (user_id, kind, payload)
    select p.id, 'ai_cap_reached', jsonb_build_object('month', to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM'))
    from public.profiles p
    where p.role = 'platform_admin'
      and not exists (select 1 from public.notifications n where n.user_id = p.id and n.kind = 'ai_cap_reached'
                      and n.payload ->> 'month' = to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM'));
    return query select false, 'monthly_cap'::text, m; return;
  end if;
  return query select true, 'ok'::text, m;
end $$;

-- 다시 정의: 상담 하루 상한 (사용권 daily_cap이 있으면 그 값, 없으면 300. daily_cap은 본사 RPC로만 넣고 기본 null)
create or replace function private.consult_quota_ok(p_shop_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select count(*) < coalesce((select l.daily_cap from public.consult_licenses l where l.shop_id = p_shop_id),
                             private.setting_int('ai_consult_daily_calls_per_shop'))
  from public.ai_usage
  where shop_id = p_shop_id and feature = 'consult'
    and created_at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
$$;

-- 다시 정의: 상담 설정 (기존 본문 그대로 + 스위치가 켜져 있으면 사용권 없이 자동응답 켜기 거부. 끄기·고지 문구는 언제나 허용)
create or replace function public.set_consult_settings(p_shop_id uuid, p_auto_reply boolean, p_disclosure text, p_disclose_first boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare old_auto boolean;
begin
  if not private.is_shop_member(p_shop_id) then
    raise exception '우리 샵 설정만 바꿀 수 있습니다' using errcode = '42501';
  end if;
  if p_auto_reply is true and private.consult_license_required() and private.consult_license_ok(p_shop_id) <> 'ok' then
    raise exception 'AI 상담 사용권이 없어 켤 수 없습니다' using errcode = '42501', hint = 'consult_license';
  end if;
  if p_disclosure is not null and length(btrim(p_disclosure)) not between 1 and 300 then
    raise exception '고지 문구는 1~300자로 적어 주세요' using errcode = '22023';
  end if;
  insert into public.shop_consult_settings (shop_id) values (p_shop_id) on conflict do nothing;
  select auto_reply_enabled into old_auto from public.shop_consult_settings where shop_id = p_shop_id for update;
  update public.shop_consult_settings
     set auto_reply_enabled = coalesce(p_auto_reply, auto_reply_enabled),
         ai_disclosure_text = coalesce(nullif(btrim(p_disclosure), ''), ai_disclosure_text),
         disclose_first_reply = coalesce(p_disclose_first, disclose_first_reply),
         updated_at = now()
   where shop_id = p_shop_id;
  if p_auto_reply is not null and p_auto_reply is distinct from old_auto then
    perform private.audit(p_shop_id, case when p_auto_reply then 'consult_auto_reply_on' else 'consult_auto_reply_off' end,
                          'shop_consult_settings', p_shop_id, '{}');
  end if;
end $$;

-- 다시 정의: 인스타 연결 (기존 본문 그대로 + 스위치가 켜져 있으면 사용권이 있을 때만 새 연결, Q16)
create or replace function public.consult_connect_instagram(p_shop_id uuid, p_actor uuid, p_external_id text, p_credentials_enc text,
                                                            p_token_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare ch uuid;
begin
  if p_actor is null or not exists (select 1 from public.shop_members where shop_id = p_shop_id and user_id = p_actor) then
    raise exception '우리 샵에만 연결할 수 있습니다' using errcode = '42501';
  end if;
  if private.consult_license_required() and private.consult_license_ok(p_shop_id) <> 'ok' then
    raise exception 'AI 상담 사용권이 없어 인스타그램을 연결할 수 없습니다' using errcode = '42501', hint = 'consult_license';
  end if;
  if p_external_id is null or p_external_id !~ '^[0-9]{1,40}$' then
    raise exception '인스타 계정 id 형식이 아닙니다' using errcode = '22023';
  end if;
  if p_credentials_enc is null then raise exception '토큰이 없습니다' using errcode = '22023'; end if;
  if exists (select 1 from public.shop_channels where channel = 'instagram' and external_id = p_external_id and shop_id <> p_shop_id) then
    raise exception '이 인스타그램 계정은 이미 다른 샵에 연결되어 있습니다' using errcode = '23505';
  end if;
  insert into public.shop_channels (shop_id, channel, external_id, credentials_enc, token_expires_at, enabled)
  values (p_shop_id, 'instagram', p_external_id, p_credentials_enc, p_token_expires_at, true)
  on conflict (shop_id, channel) do update
    set external_id = excluded.external_id, credentials_enc = excluded.credentials_enc,
        token_expires_at = excluded.token_expires_at, enabled = true, updated_at = now()
  returning id into ch;
  insert into public.audit_events (shop_id, actor_id, action, target_table, target_id, detail)
  values (p_shop_id, p_actor, 'consult_channel_connected', 'shop_channels', ch, '{"channel": "instagram"}');
  return ch;
end $$;

-- 웹훅 확인 (서버 전용, 쿼리 1개): 'ok' / 'no_license' / 'monthly_quota'. 스위치가 꺼져 있으면 언제나 'ok'
create function public.consult_license_check(p_shop_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(private.consult_license_block(p_shop_id), 'ok')
$$;
revoke execute on function public.consult_license_check(uuid) from public, anon, authenticated;
grant execute on function public.consult_license_check(uuid) to service_role;

-- 샵 화면용 사용권·사용량 (샵 멤버·본사). 가격은 넣지 않는다(Q17, 약관 확정 전)
create function public.consult_my_usage(p_shop_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare l public.consult_licenses; p public.consult_plans; w record;
        base jsonb;
begin
  if not (private.is_shop_member(p_shop_id) or private.is_platform_admin()) then
    raise exception '우리 샵 사용량만 볼 수 있습니다' using errcode = '42501';
  end if;
  base := jsonb_build_object('required', private.consult_license_required(), 'state', private.consult_license_ok(p_shop_id),
                             'month', to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM'), 'used', private.consult_month_used(p_shop_id),
                             'block', private.consult_license_block(p_shop_id),
                             -- 사용권이 없을 때 안내 문구용(지금 부여에 쓰는 요금제의 체험 일수)
                             'trial_days', (select x.trial_days from public.consult_plans x where x.active order by x.created_at desc limit 1));
  select * into l from public.consult_licenses where shop_id = p_shop_id;
  if l.shop_id is null then return base; end if;
  select * into p from public.consult_plans where id = l.plan_id;
  select * into w from private.consult_license_window(p_shop_id);
  return base || jsonb_build_object(
    'status', l.status, 'start_mode', l.start_mode, 'suspended_reason', l.suspended_reason,
    'starts_at', w.w_starts, 'ends_at', w.w_ends, 'wait_until', w.w_wait_until,
    'included', l.included_monthly_responses, 'limit', private.consult_month_limit(p_shop_id),
    'overage_policy', l.overage_policy, 'pack_size', p.pack_size, 'trial_days', p.trial_days);
end $$;
revoke execute on function public.consult_my_usage(uuid) from public, anon;
grant execute on function public.consult_my_usage(uuid) to authenticated;

-- 본사 RPC (모두 감사 기록, admin_note는 감사 기록에 넣지 않는다 — 샵 멤버도 감사 기록을 읽는다) ----------
create function public.consult_admin_grant_license(p_shop_id uuid, p_mode text default 'first_auto_reply', p_starts_at timestamptz default null,
                                                   p_plan_id uuid default null, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.consult_plans; s timestamptz; e timestamptz;
begin
  perform private.consult_admin_only();
  if not exists (select 1 from public.shops where id = p_shop_id) then raise exception '없는 샵입니다' using errcode = '22023'; end if;
  if exists (select 1 from public.consult_licenses where shop_id = p_shop_id) then
    raise exception '이미 사용권이 있습니다. 연장·유료 전환을 써 주세요' using errcode = '23505';
  end if;
  select * into p from public.consult_plans
   where active and (p_plan_id is null or id = p_plan_id) order by created_at desc limit 1;
  if p.id is null then raise exception '쓸 수 있는 요금제가 없습니다' using errcode = '22023'; end if;
  if p_mode is null or p_mode not in ('first_auto_reply', 'fixed') then raise exception '시작 기준을 골라 주세요' using errcode = '22023'; end if;
  if p_mode = 'fixed' then
    if p_starts_at is null then raise exception '시작일을 넣어 주세요' using errcode = '22023'; end if;
    s := p_starts_at; e := private.consult_kst_day_end(p_starts_at, p.trial_days);
  end if;
  insert into public.consult_licenses (shop_id, plan_id, status, start_mode, starts_at, ends_at, included_monthly_responses, overage_policy,
                                       granted_by, updated_by, admin_note)
  values (p_shop_id, p.id, 'trial', p_mode, s, e, p.included_monthly_responses, p.overage_policy, auth.uid(), auth.uid(), nullif(btrim(p_note), ''));
  perform private.audit(p_shop_id, 'consult_license_granted', 'consult_licenses', p_shop_id,
    jsonb_build_object('plan', p.code, 'status', 'trial', 'start_mode', p_mode, 'starts_at', s, 'ends_at', e, 'included', p.included_monthly_responses));
  perform private.consult_notify(p_shop_id, 'consult_license_granted', jsonb_build_object('trial_days', p.trial_days, 'start_mode', p_mode, 'starts_at', s), false, null);
end $$;

create function public.consult_admin_set_paid(p_shop_id uuid, p_starts_at timestamptz, p_ends_at timestamptz, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare l public.consult_licenses;
begin
  perform private.consult_admin_only();
  select * into l from public.consult_licenses where shop_id = p_shop_id for update;
  if l.shop_id is null then raise exception '사용권이 없습니다. 먼저 부여해 주세요' using errcode = '22023'; end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception '청구 기간(시작·종료일)을 확인해 주세요' using errcode = '22023';
  end if;
  update public.consult_licenses
     set status = 'paid', start_mode = 'fixed', starts_at = p_starts_at, ends_at = p_ends_at, suspended_reason = null,
         admin_note = case when p_note is null then admin_note else nullif(btrim(p_note), '') end,
         updated_by = auth.uid(), updated_at = now()
   where shop_id = p_shop_id;
  perform private.audit(p_shop_id, 'consult_license_paid', 'consult_licenses', p_shop_id,
    jsonb_build_object('from', l.status, 'starts_at', p_starts_at, 'ends_at', p_ends_at, 'old_ends_at', l.ends_at));
end $$;

create function public.consult_admin_extend(p_shop_id uuid, p_ends_at timestamptz, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare l public.consult_licenses; w record; s timestamptz; st text;
begin
  perform private.consult_admin_only();
  select * into l from public.consult_licenses where shop_id = p_shop_id for update;
  if l.shop_id is null then raise exception '사용권이 없습니다. 먼저 부여해 주세요' using errcode = '22023'; end if;
  select * into w from private.consult_license_window(p_shop_id);
  s := coalesce(w.w_starts, now());
  if p_ends_at is null or p_ends_at <= now() or p_ends_at <= s then
    raise exception '새 종료일은 오늘 이후로 넣어 주세요' using errcode = '22023';
  end if;
  -- 중지 상태면 다시 켠다(체험이 끝나 중지된 것은 체험으로, 그 밖은 유료로). 자동응답은 사장님이 다시 켠다(Q9)
  st := case when l.status <> 'suspended' then l.status when l.suspended_reason = 'trial_ended' then 'trial' else 'paid' end;
  update public.consult_licenses
     set status = st, suspended_reason = null, starts_at = s, ends_at = p_ends_at,
         admin_note = case when p_note is null then admin_note else nullif(btrim(p_note), '') end,
         updated_by = auth.uid(), updated_at = now()
   where shop_id = p_shop_id;
  perform private.audit(p_shop_id, 'consult_license_extended', 'consult_licenses', p_shop_id,
    jsonb_build_object('status', st, 'old_ends_at', w.w_ends, 'ends_at', p_ends_at));
  if l.status = 'suspended' then
    perform private.audit(p_shop_id, 'consult_license_resumed', 'consult_licenses', p_shop_id,
      jsonb_build_object('from_reason', l.suspended_reason, 'status', st));
  end if;
  perform private.consult_notify(p_shop_id, 'consult_license_extended', jsonb_build_object('ends_at', p_ends_at, 'resumed', l.status = 'suspended'), false, null);
end $$;

create function public.consult_admin_suspend(p_shop_id uuid, p_reason text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare l public.consult_licenses;
begin
  perform private.consult_admin_only();
  if p_reason is null or p_reason not in ('admin', 'unpaid', 'terminated') then
    raise exception '중지 이유를 골라 주세요(본사·미납·해지)' using errcode = '22023';
  end if;
  select * into l from public.consult_licenses where shop_id = p_shop_id for update;
  if l.shop_id is null then raise exception '사용권이 없습니다' using errcode = '22023'; end if;
  if l.status = 'suspended' then raise exception '이미 중지된 사용권입니다' using errcode = '22023'; end if;
  update public.consult_licenses
     set status = 'suspended', suspended_reason = p_reason,
         admin_note = case when p_note is null then admin_note else nullif(btrim(p_note), '') end,
         updated_by = auth.uid(), updated_at = now()
   where shop_id = p_shop_id;
  perform private.audit(p_shop_id, 'consult_license_suspended', 'consult_licenses', p_shop_id,
    jsonb_build_object('from', l.status, 'reason', p_reason, 'ends_at', l.ends_at));
  update public.shop_consult_settings set auto_reply_enabled = false, updated_at = now() where shop_id = p_shop_id and auto_reply_enabled;
  if found then
    perform private.audit(p_shop_id, 'consult_auto_reply_off', 'shop_consult_settings', p_shop_id, '{"by": "license_suspended"}');
  end if;
  perform private.consult_notify(p_shop_id, 'consult_license_suspended', jsonb_build_object('reason', p_reason), true, null);
end $$;

create function public.consult_admin_add_pack(p_shop_id uuid, p_month text, p_count int)
returns void language plpgsql security definer set search_path = '' as $$
declare l public.consult_licenses; p public.consult_plans;
begin
  perform private.consult_admin_only();
  if p_month is null or p_month not in (to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM'),
                                        to_char(private.consult_kst_month_start(now(), 1) at time zone 'Asia/Seoul', 'YYYY-MM')) then
    raise exception '팩은 이번 달·다음 달만 넣을 수 있습니다' using errcode = '22023';
  end if;
  if p_count is null or p_count not between 1 and 20 then raise exception '팩 수는 1~20개로 넣어 주세요' using errcode = '22023'; end if;
  select * into l from public.consult_licenses where shop_id = p_shop_id;
  if l.shop_id is null then raise exception '사용권이 없습니다' using errcode = '22023'; end if;
  select * into p from public.consult_plans where id = l.plan_id;
  insert into public.consult_usage_packs (shop_id, month, responses, price_krw, granted_by)
  values (p_shop_id, p_month, p.pack_size * p_count, p.pack_price_krw * p_count, auth.uid());
  perform private.audit(p_shop_id, 'consult_pack_added', 'consult_licenses', p_shop_id,
    jsonb_build_object('month', p_month, 'packs', p_count, 'responses', p.pack_size * p_count, 'plan', p.code));
end $$;

create function public.consult_admin_set_quota(p_shop_id uuid, p_included int, p_daily_cap int)
returns void language plpgsql security definer set search_path = '' as $$
declare l public.consult_licenses;
begin
  perform private.consult_admin_only();
  if p_included is null or p_included not between 1 and 1000000 then raise exception '포함 응답은 1~1,000,000건으로 넣어 주세요' using errcode = '22023'; end if;
  if p_daily_cap is not null and p_daily_cap not between 1 and 10000 then raise exception '하루 상한은 1~10,000회로 넣어 주세요' using errcode = '22023'; end if;
  select * into l from public.consult_licenses where shop_id = p_shop_id for update;
  if l.shop_id is null then raise exception '사용권이 없습니다' using errcode = '22023'; end if;
  update public.consult_licenses
     set included_monthly_responses = p_included, daily_cap = p_daily_cap, updated_by = auth.uid(), updated_at = now()
   where shop_id = p_shop_id;
  perform private.audit(p_shop_id, 'consult_license_quota_changed', 'consult_licenses', p_shop_id,
    jsonb_build_object('old_included', l.included_monthly_responses, 'included', p_included, 'old_daily_cap', l.daily_cap, 'daily_cap', p_daily_cap));
end $$;

-- 새 요금제 (가격을 바꿀 때 새 행, p_retire_plan_id가 있으면 옛 행을 끈다. 이미 부여한 사용권은 부여 때 값 그대로)
create function public.consult_admin_create_plan(p_code text, p_name text, p_monthly_price_krw int, p_included int, p_overage_policy text,
                                                 p_pack_size int, p_pack_price_krw int, p_trial_days int, p_trial_wait_days int,
                                                 p_expiry_notice_days int, p_retire_plan_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  perform private.consult_admin_only();
  insert into public.consult_plans (code, name, monthly_price_krw, vat_included, included_monthly_responses, overage_policy, pack_size, pack_price_krw,
                                    trial_days, trial_wait_days, expiry_notice_days, created_by)
  values (p_code, btrim(p_name), p_monthly_price_krw, false, p_included, p_overage_policy, p_pack_size, p_pack_price_krw,
          p_trial_days, p_trial_wait_days, p_expiry_notice_days, auth.uid())
  returning consult_plans.id into new_id;
  if p_retire_plan_id is not null then
    update public.consult_plans set active = false where consult_plans.id = p_retire_plan_id and consult_plans.id <> new_id;
  end if;
  perform private.audit(null, 'consult_plan_created', 'consult_plans', new_id,
    jsonb_build_object('code', p_code, 'monthly_price_krw', p_monthly_price_krw, 'included', p_included, 'overage_policy', p_overage_policy,
                       'pack_size', p_pack_size, 'pack_price_krw', p_pack_price_krw, 'retired', p_retire_plan_id));
  return new_id;
end $$;

revoke execute on function public.consult_admin_grant_license(uuid, text, timestamptz, uuid, text) from public, anon;
revoke execute on function public.consult_admin_set_paid(uuid, timestamptz, timestamptz, text) from public, anon;
revoke execute on function public.consult_admin_extend(uuid, timestamptz, text) from public, anon;
revoke execute on function public.consult_admin_suspend(uuid, text, text) from public, anon;
revoke execute on function public.consult_admin_add_pack(uuid, text, int) from public, anon;
revoke execute on function public.consult_admin_set_quota(uuid, int, int) from public, anon;
revoke execute on function public.consult_admin_create_plan(text, text, int, int, text, int, int, int, int, int, uuid) from public, anon;
grant execute on function public.consult_admin_grant_license(uuid, text, timestamptz, uuid, text) to authenticated;
grant execute on function public.consult_admin_set_paid(uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.consult_admin_extend(uuid, timestamptz, text) to authenticated;
grant execute on function public.consult_admin_suspend(uuid, text, text) to authenticated;
grant execute on function public.consult_admin_add_pack(uuid, text, int) to authenticated;
grant execute on function public.consult_admin_set_quota(uuid, int, int) to authenticated;
grant execute on function public.consult_admin_create_plan(text, text, int, int, text, int, int, int, int, int, uuid) to authenticated;

-- 본사 사용권 표 (P23-3 화면). 샵마다 한 줄(사용권이 없는 샵 포함). 숫자·uuid·날짜·상태 값과 본사 메모만 — 손님 글·연락처 없음
create function public.consult_admin_license_overview(p_month text)
returns table (
  shop_id uuid, plan_code text, status text, state text, suspended_reason text, start_mode text,
  starts_at timestamptz, ends_at timestamptz, wait_until timestamptz,
  included int, pack_responses int, used int, auto_replies int, calls int, fails int, cost_krw numeric,
  daily_max int, daily_cap int, kakao_on boolean, instagram_on boolean, auto_reply_on boolean,
  updated_by uuid, updated_at timestamptz, admin_note text
)
language plpgsql stable security definer set search_path = '' as $$
declare f timestamptz; t timestamptz;
begin
  perform private.consult_admin_only();
  if p_month is null or p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception '달은 YYYY-MM으로 넣어 주세요' using errcode = '22023'; end if;
  f := (to_date(p_month || '-01', 'YYYY-MM-DD')::timestamp) at time zone 'Asia/Seoul';
  t := private.consult_kst_month_start(f, 1);
  return query
  with u as (
    select x.shop_id as sid, count(*)::int as calls, (count(*) filter (where not x.ok))::int as fails,
           (count(*) filter (where x.ok))::int as used, coalesce(sum(x.cost_krw), 0) as cost
    from public.ai_usage x
    where x.feature = 'consult' and x.shop_id is not null and x.created_at >= f and x.created_at < t
    group by x.shop_id
  ), d as (
    select y.sid, max(y.n)::int as daily_max from (
      select x.shop_id as sid, count(*) as n from public.ai_usage x
      where x.feature = 'consult' and x.shop_id is not null and x.created_at >= f and x.created_at < t
      group by x.shop_id, (x.created_at at time zone 'Asia/Seoul')::date) y
    group by y.sid
  ), a as (
    select m.shop_id as sid, count(*)::int as n from public.messages m
    where m.role = 'ai' and m.delivery_status = 'sent' and m.sent_at >= f and m.sent_at < t
    group by m.shop_id
  ), k as (
    select k2.shop_id as sid, sum(k2.responses)::int as n from public.consult_usage_packs k2 where k2.month = p_month group by k2.shop_id
  )
  select s.id, p.code, l.status, private.consult_license_ok(s.id), l.suspended_reason, l.start_mode,
         w.w_starts, w.w_ends, w.w_wait_until,
         l.included_monthly_responses, coalesce(k.n, 0), coalesce(u.used, 0), coalesce(a.n, 0), coalesce(u.calls, 0), coalesce(u.fails, 0),
         coalesce(u.cost, 0), coalesce(d.daily_max, 0), coalesce(l.daily_cap, private.setting_int('ai_consult_daily_calls_per_shop')),
         exists (select 1 from public.shop_channels c where c.shop_id = s.id and c.channel = 'kakao' and c.enabled),
         exists (select 1 from public.shop_channels c where c.shop_id = s.id and c.channel = 'instagram' and c.enabled),
         coalesce((select cs.auto_reply_enabled from public.shop_consult_settings cs where cs.shop_id = s.id), false),
         l.updated_by, l.updated_at, l.admin_note
  from public.shops s
  left join public.consult_licenses l on l.shop_id = s.id
  left join public.consult_plans p on p.id = l.plan_id
  left join lateral private.consult_license_window(s.id) w on true
  left join u on u.sid = s.id
  left join d on d.sid = s.id
  left join a on a.sid = s.id
  left join k on k.sid = s.id
  order by (l.shop_id is null), w.w_ends nulls last, s.created_at;
end $$;
revoke execute on function public.consult_admin_license_overview(text) from public, anon;
grant execute on function public.consult_admin_license_overview(text) to authenticated;

-- 매일 정리 작업 (서버 전용, /api/maintenance/daily 03:00 KST) ------------------------------------
-- 1) 대기 14일이 지난 체험에 시작·종료일을 채운다(언제나, 판정 함수와 같은 값)
-- 2) 스위치가 켜져 있을 때만: 끝난 사용권 중지(+자동응답 끄기), 만료 3일 전 알림(종료일마다 한 번), 이번 달 80%·100% 알림(달마다 한 번)
-- 돌려주는 값: 건수만
create function public.consult_license_sweep()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; n_start int := 0; n_susp int := 0; n_notice int := 0; n_warn int := 0; n_full int := 0;
        req boolean := private.consult_license_required(); mk text := to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM');
        used int; lim int; reason text;
begin
  for r in
    select l.shop_id, l.granted_at + make_interval(days => p.trial_wait_days) as s, p.trial_days
    from public.consult_licenses l join public.consult_plans p on p.id = l.plan_id
    where l.status = 'trial' and l.start_mode = 'first_auto_reply' and l.starts_at is null
      and l.granted_at + make_interval(days => p.trial_wait_days) <= now()
    for update of l
  loop
    update public.consult_licenses set starts_at = r.s, ends_at = private.consult_kst_day_end(r.s, r.trial_days), updated_at = now()
     where shop_id = r.shop_id;
    perform private.audit(r.shop_id, 'consult_trial_started', 'consult_licenses', r.shop_id,
      jsonb_build_object('by', 'wait_elapsed', 'starts_at', r.s, 'ends_at', private.consult_kst_day_end(r.s, r.trial_days)));
    n_start := n_start + 1;
  end loop;

  if not req then
    return jsonb_build_object('required', false, 'trial_started', n_start, 'suspended', 0, 'expiry_notices', 0, 'quota_warnings', 0, 'quota_reached', 0);
  end if;

  -- 끝난 사용권 중지
  for r in
    select l.shop_id, l.status, l.ends_at from public.consult_licenses l
    where l.status in ('trial', 'paid') and l.ends_at is not null and l.ends_at <= now()
    for update
  loop
    reason := case when r.status = 'trial' then 'trial_ended' else 'expired' end;
    update public.consult_licenses set status = 'suspended', suspended_reason = reason, updated_at = now() where shop_id = r.shop_id;
    perform private.audit(r.shop_id, 'consult_license_suspended', 'consult_licenses', r.shop_id,
      jsonb_build_object('from', r.status, 'reason', reason, 'ends_at', r.ends_at));
    update public.shop_consult_settings set auto_reply_enabled = false, updated_at = now() where shop_id = r.shop_id and auto_reply_enabled;
    if found then
      perform private.audit(r.shop_id, 'consult_auto_reply_off', 'shop_consult_settings', r.shop_id, '{"by": "license_suspended"}');
    end if;
    perform private.consult_notify(r.shop_id, 'consult_license_suspended', jsonb_build_object('reason', reason), true, null);
    n_susp := n_susp + 1;
  end loop;

  -- 만료 알림 (종료일 expiry_notice_days일 전부터, 같은 종료일에 한 번)
  for r in
    select l.shop_id, l.status, l.ends_at from public.consult_licenses l join public.consult_plans p on p.id = l.plan_id
    where l.status in ('trial', 'paid') and l.ends_at > now() and l.ends_at <= now() + make_interval(days => p.expiry_notice_days)
      and l.notice_sent_for is distinct from l.ends_at
    for update of l
  loop
    perform private.consult_notify(r.shop_id, 'consult_license_expiring', jsonb_build_object('status', r.status, 'ends_at', r.ends_at), false, null);
    update public.consult_licenses set notice_sent_for = r.ends_at where shop_id = r.shop_id;
    n_notice := n_notice + 1;
  end loop;

  -- 이번 달 80%·100% (사용 중인 사용권만)
  for r in select l.shop_id from public.consult_licenses l where l.status in ('trial', 'paid') loop
    if private.consult_license_ok(r.shop_id) <> 'ok' then continue; end if;
    used := private.consult_month_used(r.shop_id);
    lim := private.consult_month_limit(r.shop_id);
    if used >= lim then
      n_full := n_full + sign(private.consult_notify(r.shop_id, 'consult_quota_reached', jsonb_build_object('month', mk, 'used', used, 'limit', lim), true, mk));
    elsif used * 10 >= lim * 8 then
      n_warn := n_warn + sign(private.consult_notify(r.shop_id, 'consult_quota_warning', jsonb_build_object('month', mk, 'used', used, 'limit', lim), true, mk));
    end if;
  end loop;

  return jsonb_build_object('required', true, 'trial_started', n_start, 'suspended', n_susp, 'expiry_notices', n_notice,
                            'quota_warnings', n_warn, 'quota_reached', n_full);
end $$;
revoke execute on function public.consult_license_sweep() from public, anon, authenticated;
grant execute on function public.consult_license_sweep() to service_role;

-- 자동 이행 (7-2): 자동응답을 켰거나 채널을 켠 샵에 체험(첫 자동응답 기준). 이미 자동응답이 나간 샵은 지금 시작 -----------
create function private.consult_license_migrate() returns int
language plpgsql security definer set search_path = '' as $$
declare p public.consult_plans; r record; n int := 0; s timestamptz; e timestamptz;
begin
  select * into p from public.consult_plans where code = 'standard_v1';
  for r in
    select x.shop_id from (
      select cs.shop_id from public.shop_consult_settings cs where cs.auto_reply_enabled
      union
      select c.shop_id from public.shop_channels c where c.enabled) x
    where not exists (select 1 from public.consult_licenses l where l.shop_id = x.shop_id)
  loop
    if exists (select 1 from public.messages m where m.shop_id = r.shop_id and m.role = 'ai' and m.delivery_status = 'sent') then
      s := now(); e := private.consult_kst_day_end(now(), p.trial_days);
    else
      s := null; e := null;
    end if;
    insert into public.consult_licenses (shop_id, plan_id, status, start_mode, starts_at, ends_at, included_monthly_responses, overage_policy)
    values (r.shop_id, p.id, 'trial', 'first_auto_reply', s, e, p.included_monthly_responses, p.overage_policy);
    perform private.audit(r.shop_id, 'consult_license_granted', 'consult_licenses', r.shop_id,
      jsonb_build_object('migration', true, 'plan', p.code, 'status', 'trial', 'start_mode', 'first_auto_reply', 'starts_at', s, 'ends_at', e));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function private.consult_license_migrate() from public, anon, authenticated;

select private.consult_license_migrate();
