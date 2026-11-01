-- P13-2 14세 미만 손님
-- 출생 연도(선택)만 받는다. 연도만으로는 생일 전후를 알 수 없어, 올해 기준 14살 이하이면 14세 미만으로 본다(보수적으로).
-- 14세 미만이면 보호자 이름·연락처가 필요하고, 선택 동의는 보호자의 동의만 유효하다.
-- 보호자 확인: 문자 인증 서비스가 없어(P13-2b) 지금은 샵이 보호자에게 보내는 1회용 동의 링크에서 보호자가 직접 고른 것을 보호자 동의로 본다.
alter table customers add column birth_year int check (birth_year between 1900 and 2100);

create function private.is_minor(p_birth_year int) returns boolean
language sql stable set search_path = '' as $$
  select p_birth_year is not null
     and extract(year from now() at time zone 'Asia/Seoul')::int - p_birth_year <= 14
$$;

create function private.require_guardian() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.is_minor(new.birth_year)
     and (nullif(btrim(coalesce(new.guardian_name, '')), '') is null or nullif(btrim(coalesce(new.guardian_phone, '')), '') is null) then
    raise exception '14세 미만 손님은 보호자 이름과 연락처가 필요합니다' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger require_guardian before insert or update of birth_year, guardian_name, guardian_phone on customers
  for each row execute function private.require_guardian();

-- 유효 조건에 14세 미만 = 보호자 동의만 추가
create or replace view customer_consent_state with (security_invoker = true) as
select distinct on (c.customer_id, c.kind)
  c.shop_id, c.customer_id, c.kind, c.granted, c.subject, c.method, c.text_version, c.created_at,
  (c.granted and c.subject in ('self', 'guardian')
     and (c.subject = 'guardian' or not private.is_minor(cu.birth_year))
     and c.created_at > now() - make_interval(years => private.setting_int('consent_recheck_years'))) as valid,
  (c.granted and c.subject in ('self', 'guardian')
     and c.created_at <= now() - make_interval(years => private.setting_int('consent_recheck_years'))) as needs_recheck
from public.customer_consents c
join public.customers cu on cu.id = c.customer_id
order by c.customer_id, c.kind, c.created_at desc, c.seq desc;

-- 토큰은 원문을 저장하지 않는다 (sha256 해시)
create function private.token_hash(p_token text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
$$;
create function private.new_token() returns text
language sql volatile set search_path = '' as $$
  select translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_')
$$;

-- 손님별 1회용 동의 링크 (7일)
create table consent_links (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table consent_links enable row level security;
create policy member_read on consent_links for select to authenticated using (private.is_shop_member(shop_id));

create function private.create_consent_link_internal(p_customer_id uuid, p_by uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  t text := private.new_token();
begin
  insert into public.consent_links (shop_id, customer_id, token_hash, expires_at, created_by)
  select shop_id, id, private.token_hash(t), now() + interval '7 days', p_by from public.customers where id = p_customer_id;
  return t;
end $$;

create function public.create_consent_link(p_customer_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  s uuid;
begin
  select shop_id into s from public.customers where id = p_customer_id;
  if s is null or not private.is_shop_member(s) then
    raise exception '우리 샵 손님이 아닙니다' using errcode = '42501';
  end if;
  return private.create_consent_link_internal(p_customer_id, auth.uid());
end $$;

-- 공개 페이지용 (서버가 service_role로만 부른다). 링크로 알 수 있는 것은 샵 이름·이름 첫 글자·14세 미만 여부뿐.
create function public.public_consent_context(p_token text)
returns table (shop_name text, customer_initial text, is_minor boolean, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.name, left(c.name, 1), private.is_minor(c.birth_year), l.expires_at
  from public.consent_links l
  join public.customers c on c.id = l.customer_id
  join public.shops s on s.id = l.shop_id
  where l.token_hash = private.token_hash(p_token) and l.used_at is null and l.expires_at > now()
$$;

create function public.public_submit_consent(p_token text, p_marketing boolean, p_photo boolean, p_method text,
                                             p_marketing_version text, p_photo_version text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  l public.consent_links;
  minor boolean;
  who text;
begin
  select * into l from public.consent_links
  where token_hash = private.token_hash(p_token) and used_at is null and expires_at > now()
  for update;
  if l.id is null then
    raise exception '만료됐거나 이미 쓴 링크입니다' using errcode = '22023';
  end if;
  if p_method not in ('qr', 'link') or coalesce(p_marketing_version, '') = '' or coalesce(p_photo_version, '') = '' then
    raise exception '요청을 확인해 주세요' using errcode = '22023';
  end if;
  select private.is_minor(birth_year) into minor from public.customers where id = l.customer_id;
  who := case when minor then 'guardian' else 'self' end;
  -- 고른 것·고르지 않은 것 모두 남긴다 (철회도 기록)
  insert into public.customer_consents (shop_id, customer_id, kind, granted, subject, method, text_version)
  values (l.shop_id, l.customer_id, 'marketing', coalesce(p_marketing, false), who, p_method, p_marketing_version),
         (l.shop_id, l.customer_id, 'photo', coalesce(p_photo, false), who, p_method, p_photo_version);
  update public.consent_links set used_at = now() where id = l.id;
end $$;

revoke execute on function public.create_consent_link(uuid) from public, anon;
grant execute on function public.create_consent_link(uuid) to authenticated;
revoke all on function private.create_consent_link_internal(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.public_consent_context(text) from public, anon, authenticated;
revoke execute on function public.public_submit_consent(text, boolean, boolean, text, text, text) from public, anon, authenticated;
grant execute on function public.public_consent_context(text) to service_role;
grant execute on function public.public_submit_consent(text, boolean, boolean, text, text, text) to service_role;

-- 로그인 없는 공개 페이지(동의 링크·셀프 등록)의 요청 제한. 키는 서버가 만든 해시(IP 원문 없음).
create table private.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);
alter table private.rate_limits enable row level security;

-- 이번 창에서 p_max번을 넘으면 false. 하루 지난 창은 정리한다(요청 횟수 기록일 뿐 개인정보 아님).
create function public.public_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n int;
begin
  insert into private.rate_limits (key, window_start, hits) values (left(p_key, 200), w, 1)
  on conflict (key, window_start) do update set hits = private.rate_limits.hits + 1
  returning hits into n;
  if random() < 0.01 then
    delete from private.rate_limits where window_start < now() - interval '1 day';
  end if;
  return n <= p_max;
end $$;
revoke execute on function public.public_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.public_rate_limit(text, int, int) to service_role;
