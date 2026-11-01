-- P13-3 손님 셀프 등록 (샵별 QR·링크)
-- 샵 관리자가 만료 있는 등록 링크를 발급·폐기한다(토큰은 해시로만 저장). 손님이 로그인 없이 휴대폰에서 직접 입력하면
-- 그 샵에 손님 카드가 생긴다. 공개 함수는 서버(service_role)만 부르고, 토큰이 가리키는 샵에 쓰기만 할 뿐 아무것도 읽어 돌려주지 않는다.
-- 같은 샵에 같은 연락처 손님이 있으면 새 카드에 병합 후보를 표시하고, 샵이 확인한 뒤 병합한다.
-- 14세 미만의 선택 동의는 보호자 휴대폰으로 보낸 링크(method = 'link')에서 한 것만 유효하다: QR 카운터에서는 보호자인지 확인할 수 없다.

alter table customers add column source text not null default 'staff' check (source in ('staff', 'self'));
alter table customers add column merge_candidate_id uuid references customers(id) on delete set null;

create table registration_links (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  token_hash text not null unique,
  label text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table registration_links enable row level security;
create policy member_read on registration_links for select to authenticated using (private.is_shop_member(shop_id));

create function public.create_registration_link(p_shop_id uuid, p_label text, p_days int)
returns text language plpgsql security definer set search_path = '' as $$
declare
  t text := private.new_token();
begin
  if not private.is_shop_member(p_shop_id) then
    raise exception '우리 샵만 링크를 만들 수 있습니다' using errcode = '42501';
  end if;
  if p_days is null or p_days < 1 or p_days > 180 then
    raise exception '유효 기간은 1~180일입니다' using errcode = '22023';
  end if;
  insert into public.registration_links (shop_id, token_hash, label, expires_at, created_by)
  values (p_shop_id, private.token_hash(t), coalesce(nullif(left(btrim(p_label), 40), ''), '등록 링크'), now() + make_interval(days => p_days), auth.uid());
  return t;
end $$;

create function public.revoke_registration_link(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.registration_links set revoked_at = now()
  where id = p_id and revoked_at is null and private.is_shop_member(shop_id);
end $$;

create function private.registration_shop(p_token text) returns uuid
language sql stable security definer set search_path = '' as $$
  select shop_id from public.registration_links
  where token_hash = private.token_hash(p_token) and revoked_at is null and expires_at > now()
$$;

-- 공개 페이지: 샵 이름만
create function public.public_registration_context(p_token text)
returns table (shop_name text)
language sql stable security definer set search_path = '' as $$
  select s.name from public.shops s where s.id = private.registration_shop(p_token) and s.status = 'approved'
$$;

create function public.public_register_customer(
  p_token text, p_name text, p_phone text, p_birth_year int, p_level text, p_equipment_size text,
  p_guardian_name text, p_guardian_phone text, p_marketing boolean, p_photo boolean,
  p_method text, p_marketing_version text, p_photo_version text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s uuid := private.registration_shop(p_token);
  minor boolean := private.is_minor(p_birth_year);
  who text;
  dup uuid;
  cid uuid;
begin
  if s is null or not exists (select 1 from public.shops where id = s and status = 'approved') then
    raise exception '만료됐거나 폐기된 링크입니다' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null or length(p_name) > 40
     or length(coalesce(p_phone, '')) > 20 or length(coalesce(p_guardian_phone, '')) > 20
     or length(coalesce(p_guardian_name, '')) > 40 or length(coalesce(p_level, '')) > 40 or length(coalesce(p_equipment_size, '')) > 80
     or p_method not in ('qr', 'link') or coalesce(p_marketing_version, '') = '' or coalesce(p_photo_version, '') = '' then
    raise exception '입력을 확인해 주세요' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_phone, '')), '') is null and nullif(btrim(coalesce(p_guardian_phone, '')), '') is null then
    raise exception '연락처나 보호자 연락처가 필요합니다' using errcode = '22023';
  end if;

  -- 같은 샵, 같은 연락처(본인 또는 보호자)
  select id into dup from public.customers c
  where c.shop_id = s
    and ((nullif(btrim(coalesce(p_phone, '')), '') is not null and c.phone = btrim(p_phone))
      or (nullif(btrim(coalesce(p_guardian_phone, '')), '') is not null and c.guardian_phone = btrim(p_guardian_phone) and c.name = btrim(p_name)))
  order by c.created_at
  limit 1;

  insert into public.customers (shop_id, name, phone, birth_year, level, equipment_size, guardian_name, guardian_phone, source, merge_candidate_id)
  values (s, btrim(p_name), nullif(btrim(coalesce(p_phone, '')), ''), p_birth_year, nullif(btrim(coalesce(p_level, '')), ''),
          nullif(btrim(coalesce(p_equipment_size, '')), ''), nullif(btrim(coalesce(p_guardian_name, '')), ''),
          nullif(btrim(coalesce(p_guardian_phone, '')), ''), 'self', dup)
  returning id into cid;

  who := case when minor then 'guardian' else 'self' end;
  insert into public.customer_consents (shop_id, customer_id, kind, granted, subject, method, text_version)
  values (s, cid, 'marketing', coalesce(p_marketing, false), who, p_method, p_marketing_version),
         (s, cid, 'photo', coalesce(p_photo, false), who, p_method, p_photo_version);
end $$;

-- 샵이 확인한 뒤 셀프 등록 카드를 기존 카드로 합친다. 이름은 기존 것을 두고, 손님이 입력한 값으로 갱신한다.
create function public.merge_customers(p_keep uuid, p_dup uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  k public.customers;
  d public.customers;
begin
  select * into k from public.customers where id = p_keep for update;
  select * into d from public.customers where id = p_dup for update;
  if k.id is null or d.id is null or k.id = d.id or k.shop_id <> d.shop_id or not private.is_shop_member(k.shop_id) then
    raise exception '우리 샵의 두 손님만 합칠 수 있습니다' using errcode = '42501';
  end if;
  if d.source <> 'self' then
    raise exception '셀프 등록 카드만 합칠 수 있습니다' using errcode = '22023';
  end if;

  update public.customers set
    phone = coalesce(d.phone, k.phone),
    birth_year = coalesce(d.birth_year, k.birth_year),
    level = coalesce(d.level, k.level),
    equipment_size = coalesce(d.equipment_size, k.equipment_size),
    guardian_name = coalesce(d.guardian_name, k.guardian_name),
    guardian_phone = coalesce(d.guardian_phone, k.guardian_phone)
  where id = k.id;

  -- 동의 기록은 고칠 수 없으니 같은 내용으로 옮겨 적는다 (시각·방법·버전·주체 그대로)
  insert into public.customer_consents (shop_id, customer_id, kind, granted, subject, method, text_version, recorded_by, created_at)
  select shop_id, k.id, kind, granted, subject, method, text_version, recorded_by, created_at
  from public.customer_consents where customer_id = d.id order by seq;
  update public.job_customers set customer_id = k.id where customer_id = d.id;
  update public.customer_contacts set customer_id = k.id where customer_id = d.id;
  update public.customers set merge_candidate_id = null where merge_candidate_id = d.id;
  delete from public.customers where id = d.id;
end $$;

-- 병합하지 않고 따로 둔다
create function public.dismiss_merge(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.customers set merge_candidate_id = null where id = p_id and private.is_shop_member(shop_id);
end $$;

-- 14세 미만 동의는 보호자가 보호자 휴대폰 링크에서 한 것만 유효
create or replace view customer_consent_state with (security_invoker = true) as
select distinct on (c.customer_id, c.kind)
  c.shop_id, c.customer_id, c.kind, c.granted, c.subject, c.method, c.text_version, c.created_at,
  (c.granted and c.subject in ('self', 'guardian')
     and ((c.subject = 'guardian' and c.method = 'link') or not private.is_minor(cu.birth_year))
     and c.created_at > now() - make_interval(years => private.setting_int('consent_recheck_years'))) as valid,
  (c.granted and c.subject in ('self', 'guardian')
     and c.created_at <= now() - make_interval(years => private.setting_int('consent_recheck_years'))) as needs_recheck
from public.customer_consents c
join public.customers cu on cu.id = c.customer_id
order by c.customer_id, c.kind, c.created_at desc, c.seq desc;

revoke execute on function public.create_registration_link(uuid, text, int) from public, anon;
revoke execute on function public.revoke_registration_link(uuid) from public, anon;
revoke execute on function public.merge_customers(uuid, uuid) from public, anon;
revoke execute on function public.dismiss_merge(uuid) from public, anon;
grant execute on function public.create_registration_link(uuid, text, int) to authenticated;
grant execute on function public.revoke_registration_link(uuid) to authenticated;
grant execute on function public.merge_customers(uuid, uuid) to authenticated;
grant execute on function public.dismiss_merge(uuid) to authenticated;
revoke execute on function public.public_registration_context(text) from public, anon, authenticated;
revoke execute on function public.public_register_customer(text, text, text, int, text, text, text, text, boolean, boolean, text, text, text) from public, anon, authenticated;
grant execute on function public.public_registration_context(text) to service_role;
grant execute on function public.public_register_customer(text, text, text, int, text, text, text, text, boolean, boolean, text, text, text) to service_role;
