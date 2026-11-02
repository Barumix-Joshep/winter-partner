-- P16-2 운영 오류·AI 실패율 알림 (새 외부 서비스 없이)
-- 서버 오류(instrumentation onRequestError)와 크론 실행 결과를 ops_events에 남기고,
-- 한 시간 안에 오류가 많거나 AI 실패율이 높으면 본사 관리자에게 알림(notifications → 웹푸시)을 한 번 보낸다.
-- 개인정보는 남기지 않는다: source는 라우트 경로 틀(/shop/jobs/[id]), detail은 오류 이름·짧은 메시지(서버에서 연락처를 지운 뒤).

insert into private.app_settings (key, value, note) values
  ('ops_error_alert_per_hour', '5', '한 시간에 서버 오류가 이만큼 쌓이면 본사에 알림'),
  ('ai_fail_alert_min_calls', '10', 'AI 실패율 알림: 한 시간 최소 호출 수'),
  ('ai_fail_alert_rate_pct', '30', 'AI 실패율 알림: 실패 비율(%)');

create table ops_events (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('server_error', 'cron_run')),
  source text not null,
  detail text,
  ok boolean not null default false,
  created_at timestamptz not null default now()
);
create index on ops_events (kind, created_at desc);
alter table ops_events enable row level security;
create policy platform_admin_read on ops_events for select to authenticated using (private.is_platform_admin());

-- 본사 관리자 모두에게, 같은 종류는 한 시간에 한 번만
create function private.notify_platform_admins(p_kind text, p_payload jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, kind, payload)
  select p.id, p_kind, p_payload from public.profiles p
  where p.role = 'platform_admin'
    and not exists (select 1 from public.notifications n
                    where n.user_id = p.id and n.kind = p_kind and n.created_at > now() - interval '1 hour')
$$;

create function private.ops_check_alerts() returns void
language plpgsql security definer set search_path = '' as $$
declare
  errs int := (select count(*) from public.ops_events where kind = 'server_error' and created_at > now() - interval '1 hour');
  calls int;
  fails int;
begin
  if errs >= private.setting_int('ops_error_alert_per_hour') then
    perform private.notify_platform_admins('ops_errors', jsonb_build_object('count', errs));
  end if;
  select count(*), count(*) filter (where not ok) into calls, fails
  from public.ai_usage where created_at > now() - interval '1 hour';
  if calls >= private.setting_int('ai_fail_alert_min_calls')
     and fails * 100 >= private.setting_int('ai_fail_alert_rate_pct') * calls then
    perform private.notify_platform_admins('ai_fail_rate', jsonb_build_object('calls', calls, 'fails', fails));
  end if;
end $$;

create function public.record_ops_event(p_kind text, p_source text, p_detail text, p_ok boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.ops_events (kind, source, detail, ok)
  values (p_kind, left(coalesce(p_source, ''), 120), left(p_detail, 300), coalesce(p_ok, false));
  if p_kind = 'server_error' then
    perform private.ops_check_alerts();
  end if;
end $$;

-- AI 실패가 기록될 때마다 실패율을 본다
create function private.ai_usage_fail_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.ops_check_alerts();
  return null;
end $$;
create trigger ai_usage_fail_check after insert on ai_usage
  for each row when (not new.ok) execute function private.ai_usage_fail_check();

-- 본사 화면용 요약
create function public.admin_ops_summary() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then
    raise exception '플랫폼 관리자만 볼 수 있습니다' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'errors_1h', (select count(*) from public.ops_events where kind = 'server_error' and created_at > now() - interval '1 hour'),
    'errors_24h', (select count(*) from public.ops_events where kind = 'server_error' and created_at > now() - interval '24 hours'),
    'recent_errors', coalesce((select jsonb_agg(e order by e.created_at desc) from (
        select source, detail, created_at from public.ops_events
        where kind = 'server_error' order by created_at desc limit 20) e), '[]'),
    'crons', coalesce((select jsonb_agg(c) from (
        select distinct on (source) source, ok, detail, created_at from public.ops_events
        where kind = 'cron_run' order by source, created_at desc) c), '[]'),
    'ai_calls_24h', (select count(*) from public.ai_usage where created_at > now() - interval '24 hours'),
    'ai_fails_24h', (select count(*) from public.ai_usage where not ok and created_at > now() - interval '24 hours'),
    'thresholds', jsonb_build_object(
      'errors_per_hour', private.setting_int('ops_error_alert_per_hour'),
      'ai_min_calls', private.setting_int('ai_fail_alert_min_calls'),
      'ai_fail_pct', private.setting_int('ai_fail_alert_rate_pct'))
  );
end $$;

revoke execute on function public.record_ops_event(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.record_ops_event(text, text, text, boolean) to service_role;
revoke execute on function public.admin_ops_summary() from public, anon;
grant execute on function public.admin_ops_summary() to authenticated;
