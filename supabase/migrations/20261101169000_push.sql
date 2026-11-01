-- P8-2 알림 발송 (알림톡 승인 전에는 웹푸시)
-- 업무 함수들이 notifications에 행을 쌓고, 서버(service_role)가 claim_notifications로 가져가 웹푸시로 보낸다.
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index on push_subscriptions (user_id);
alter table push_subscriptions enable row level security;
create policy self_all on push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create index notifications_unsent on notifications (created_at) where sent_at is null;
create index on notifications (user_id, created_at desc);

-- 보내지 않은 알림을 가져가며 sent_at을 찍는다 (여러 발송기가 동시에 돌아도 한 번만)
create function public.claim_notifications(p_limit int default 50)
returns setof notifications language sql security definer set search_path = '' as $$
  update public.notifications n set sent_at = now()
  where n.id in (
    select id from public.notifications where sent_at is null order by created_at limit p_limit for update skip locked)
  returning n.*
$$;
revoke execute on function public.claim_notifications(int) from public, anon, authenticated;
grant execute on function public.claim_notifications(int) to service_role;
