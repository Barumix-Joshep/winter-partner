-- P16-6 의견 보내기. 화면 하단 버튼 → 서버가 기록(연락처·이메일은 서버에서 가린 뒤) → 본사가 목록·상태 관리.
-- 로그인 없이도 보낼 수 있다(가입이 안 될 때). 요청 횟수 제한은 서버(public_rate_limit)가 건다.

create table feedback (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id) on delete set null,
  role text,
  page_path text not null,
  body text not null,
  contact text,
  status text not null default 'new' check (status in ('new', 'in_progress', 'done')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on feedback (status, created_at desc);
alter table feedback enable row level security;
create policy platform_admin_read on feedback for select to authenticated using (private.is_platform_admin());

create function public.submit_feedback(p_user_id uuid, p_page_path text, p_body text, p_contact text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if nullif(btrim(coalesce(p_body, '')), '') is null then
    raise exception '내용을 적어 주세요' using errcode = '22023';
  end if;
  insert into public.feedback (user_id, role, page_path, body, contact)
  values (p_user_id, (select role::text from public.profiles where id = p_user_id),
          left(coalesce(p_page_path, ''), 300), left(btrim(p_body), 2000), left(nullif(btrim(coalesce(p_contact, '')), ''), 100));
end $$;

create function public.set_feedback_status(p_id bigint, p_status text, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then
    raise exception '플랫폼 관리자만 바꿀 수 있습니다' using errcode = '42501';
  end if;
  update public.feedback set status = p_status, admin_note = left(nullif(btrim(coalesce(p_note, '')), ''), 500), updated_at = now()
  where id = p_id;
end $$;

revoke execute on function public.submit_feedback(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_feedback(uuid, text, text, text) to service_role;
revoke execute on function public.set_feedback_status(bigint, text, text) from public, anon;
grant execute on function public.set_feedback_status(bigint, text, text) to authenticated;
