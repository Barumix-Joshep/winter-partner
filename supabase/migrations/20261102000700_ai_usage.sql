-- P14-1 AI 공통 기반
-- AI는 제안만 한다(폼 미리 채우기·추천·초안). 키가 없거나 꺼져 있거나 상한을 넘으면 앱은 수동 흐름으로 돌아간다.
-- ai_gate: 플랫폼 기본값(app_settings.ai_features) → 샵 설정(shops.ai_features) → 샵 하루 호출 상한 → 플랫폼 월 비용 상한 순으로 판단.
-- 서버(service_role)만 호출한다. 사용량은 ai_usage에 남기고, 샵은 자기 것만, 관리자는 전체를 본다.

alter table shops add column ai_features jsonb not null default '{}';

insert into private.app_settings (key, value, note) values
  ('ai_features', '{"intake":true,"cert":true,"bid_assist":true,"customer_summary":true,"note_tidy":true,"health_check":true,"revisit":true,"admin_query":true}', 'AI 기능별 플랫폼 기본값'),
  ('ai_model_text', '"claude-haiku-5-5"', '텍스트 구조화·요약 모델'),
  ('ai_model_vision', '"claude-sonnet-5-5"', '이미지 판독·입찰 분석 모델'),
  ('ai_daily_calls_per_shop', '200', '샵별 하루 AI 호출 상한'),
  ('ai_monthly_cap_krw', '50000', '플랫폼 전체 월 AI 비용 상한(원)'),
  ('ai_prices_krw_per_mtok', '{"claude-haiku-5-5":{"in":1400,"out":7000},"claude-sonnet-5-5":{"in":4200,"out":21000}}', '모델별 100만 토큰당 단가(원, 추정치 — 실제 단가로 갱신)');

create table ai_usage (
  id bigint generated always as identity primary key,
  shop_id uuid references shops(id) on delete set null,
  user_id uuid references profiles(id) on delete set null,
  feature text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_krw numeric(12, 2) not null default 0,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index on ai_usage (shop_id, created_at desc);
create index on ai_usage (created_at desc);
alter table ai_usage enable row level security;
create policy platform_admin_read on ai_usage for select to authenticated using (private.is_platform_admin());
create policy member_read on ai_usage for select to authenticated using (private.is_shop_member(shop_id));

create function private.ai_feature_known(f text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select value from private.app_settings where key = 'ai_features') ? f
$$;

-- 샵 하루 호출 상한 (한국 날짜 기준)
create function private.ai_quota_ok(p_shop_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select count(*) < private.setting_int('ai_daily_calls_per_shop')
  from public.ai_usage
  where shop_id = p_shop_id
    and created_at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
$$;

create function private.ai_month_cost() returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(cost_krw), 0) from public.ai_usage
  where created_at >= (date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
$$;

create function public.ai_gate(p_shop_id uuid, p_feature text)
returns table (allowed boolean, reason text, model text)
language plpgsql security definer set search_path = '' as $$
declare
  m text := (select value #>> '{}' from private.app_settings
             where key = case when p_feature in ('cert', 'bid_assist') then 'ai_model_vision' else 'ai_model_text' end);
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
  if p_shop_id is not null and not private.ai_quota_ok(p_shop_id) then
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

create function public.record_ai_usage(p_shop_id uuid, p_user_id uuid, p_feature text, p_model text,
                                       p_input_tokens int, p_output_tokens int, p_ok boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  price jsonb := (select value from private.app_settings where key = 'ai_prices_krw_per_mtok') -> p_model;
begin
  insert into public.ai_usage (shop_id, user_id, feature, model, input_tokens, output_tokens, cost_krw, ok)
  values (p_shop_id, p_user_id, left(p_feature, 40), left(p_model, 80), greatest(coalesce(p_input_tokens, 0), 0), greatest(coalesce(p_output_tokens, 0), 0),
          round((coalesce((price ->> 'in')::numeric, 0) * greatest(coalesce(p_input_tokens, 0), 0)
               + coalesce((price ->> 'out')::numeric, 0) * greatest(coalesce(p_output_tokens, 0), 0)) / 1000000, 2),
          coalesce(p_ok, false));
end $$;

-- 샵이 기능을 끄거나 켠다 (샵 멤버)
create function public.set_shop_ai(p_shop_id uuid, p_feature text, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_shop_member(p_shop_id) then
    raise exception '우리 샵 설정만 바꿀 수 있습니다' using errcode = '42501';
  end if;
  if not private.ai_feature_known(p_feature) then
    raise exception '모르는 AI 기능입니다' using errcode = '22023';
  end if;
  update public.shops set ai_features = ai_features || jsonb_build_object(p_feature, coalesce(p_enabled, false)) where id = p_shop_id;
end $$;

-- 플랫폼 기본값 (관리자)
create function public.set_ai_default(p_feature text, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then
    raise exception '플랫폼 관리자만 바꿀 수 있습니다' using errcode = '42501';
  end if;
  if not private.ai_feature_known(p_feature) then
    raise exception '모르는 AI 기능입니다' using errcode = '22023';
  end if;
  update private.app_settings set value = value || jsonb_build_object(p_feature, coalesce(p_enabled, false)) where key = 'ai_features';
end $$;

-- 관리자 화면용 설정 조회 (관리자만)
create function public.ai_admin_settings()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then
    raise exception '플랫폼 관리자만 볼 수 있습니다' using errcode = '42501';
  end if;
  return (select jsonb_object_agg(key, value) from private.app_settings where key like 'ai\_%')
      || jsonb_build_object('month_cost_krw', private.ai_month_cost());
end $$;

revoke execute on function public.ai_gate(uuid, text) from public, anon, authenticated;
revoke execute on function public.record_ai_usage(uuid, uuid, text, text, int, int, boolean) from public, anon, authenticated;
grant execute on function public.ai_gate(uuid, text) to service_role;
grant execute on function public.record_ai_usage(uuid, uuid, text, text, int, int, boolean) to service_role;
revoke execute on function public.set_shop_ai(uuid, text, boolean) from public, anon;
revoke execute on function public.set_ai_default(text, boolean) from public, anon;
revoke execute on function public.ai_admin_settings() from public, anon;
grant execute on function public.set_shop_ai(uuid, text, boolean) to authenticated;
grant execute on function public.set_ai_default(text, boolean) to authenticated;
grant execute on function public.ai_admin_settings() to authenticated;
