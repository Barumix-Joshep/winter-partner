-- P13-5 접속 기록: 손님 연락처 열람, 손님 목록·정산 엑셀 다운로드, 정산서 PDF 열람.
-- 누가·언제·무엇을·어느 샵. 기록은 고치거나 지울 수 없다(트리거). 보관 기간(기본 2년)이 지난 것만 정리 함수가 지운다.
create table access_logs (
  id bigint generated always as identity primary key,
  shop_id uuid not null,                 -- 샵이 탈퇴해도 기록은 남긴다 (FK 없음)
  actor_id uuid not null,
  actor_name text,
  action text not null check (action in ('customer_view', 'customer_export', 'settlement_export', 'settlement_pdf')),
  target_id uuid,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on access_logs (shop_id, created_at desc);
alter table access_logs enable row level security;
create policy platform_admin_read on access_logs for select to authenticated using (private.is_platform_admin());
create policy member_read on access_logs for select to authenticated using (private.is_shop_member(shop_id));

create function private.access_logs_immutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and current_setting('app.log_purge', true) = 'on' then
    return old;
  end if;
  raise exception '접속 기록은 고치거나 지울 수 없습니다' using errcode = '42501';
end $$;
create trigger access_logs_immutable before update or delete on access_logs
  for each row execute function private.access_logs_immutable();

-- 기록 남기기. 그 샵 멤버이거나, 정산서를 볼 수 있는 사람(받는 강사·팀)만.
create function public.log_access(p_action text, p_shop_id uuid, p_target_id uuid, p_detail jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;
  if not (private.is_shop_member(p_shop_id)
          or (p_action = 'settlement_pdf' and private.can_see_settlement(p_target_id)
              and exists (select 1 from public.settlements where id = p_target_id and shop_id = p_shop_id))) then
    raise exception '기록할 수 없는 대상입니다' using errcode = '42501';
  end if;
  insert into public.access_logs (shop_id, actor_id, actor_name, action, target_id, detail)
  values (p_shop_id, me, (select name from public.profiles where id = me), p_action, p_target_id, coalesce(p_detail, '{}'));
end $$;

-- 보관 기간이 지난 기록 정리 (크론, service_role)
create function public.purge_access_logs()
returns int language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  perform set_config('app.log_purge', 'on', true);
  delete from public.access_logs where created_at < now() - make_interval(years => private.setting_int('access_log_retention_years'));
  get diagnostics n = row_count;
  perform set_config('app.log_purge', 'off', true);
  return n;
end $$;

revoke execute on function public.log_access(text, uuid, uuid, jsonb) from public, anon;
grant execute on function public.log_access(text, uuid, uuid, jsonb) to authenticated;
revoke execute on function public.purge_access_logs() from public, anon, authenticated;
grant execute on function public.purge_access_logs() to service_role;
