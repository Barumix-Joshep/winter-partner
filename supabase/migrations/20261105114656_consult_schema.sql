-- P22-1 AI 상담 스키마 (docs/ai-consult/README.md "데이터 모델")
-- 카카오톡 채널·인스타그램 DM 상담: 채널 연결(shop_channels)·샵 안내 정보(shop_knowledge)·상담 설정(shop_consult_settings)·
-- 대화(conversations)·메시지(messages)·AI 답변 피드백(ai_feedback), 기존 문의(inquiries) 확장.
-- - 모든 표는 shop_id + RLS private.is_shop_member(shop_id). 본사·강사·다른 샵은 0건(손님 상담 내용이라 본사 정책도 두지 않는다).
-- - 대화·메시지는 로그인 사용자가 직접 쓰지 못한다. 웹훅 쓰기는 서버(service_role) 전용 security definer RPC로만.
-- - 손님 식별 값은 HMAC-SHA256 해시(64자 16진수), 비밀·연락처는 앱에서 AES-256-GCM으로 암호화한 값("v1." 접두)만 받는다(CHECK).
--   (src/lib/ai/consult/crypto.ts, 키는 서버 비밀 CONSULT_HASH_KEY·CONSULT_ENCRYPTION_KEY)
-- - AI 비용: 상담(consult)은 샵별 하루 상한을 따로 둔다(ai_consult_daily_calls_per_shop 300). 기존 상한(200)은 상담을 빼고 센다.
--   플랫폼 월 비용 상한은 함께 쓴다. 모델은 ai_model_consult.
-- - 데이터 변경: 기존 샵마다 기본 안내 템플릿 8개를 **비활성**으로 넣는다(사장님이 채우고 켠다). 앞으로 만드는 샵은 트리거로 같은 템플릿.
--   app_settings에 ai_features.consult·ai_model_consult·ai_consult_daily_calls_per_shop 추가.
-- - 보존: 대화·메시지·피드백은 90일 뒤 삭제, "강습 등록"으로 넘긴 문의만 연락처를 지우고 남긴다(사장님 결정 2026-11-05, 정리 작업은 P22-6).
--
-- 되돌리기:
--   drop trigger shop_consult_defaults on shops; drop function private.consult_seed_trigger(), private.consult_seed_shop(uuid);
--   drop function public.consult_record_customer_message(uuid, text, text, text, text), public.consult_record_reply(uuid, text, text, text, numeric, text, text),
--     public.consult_open_inquiry(uuid, text, jsonb, text, text), public.set_consult_settings(uuid, boolean, text, boolean);
--   drop table ai_feedback, messages; alter table inquiries drop column conversation_id, drop column type, drop column extracted,
--     drop column contact_enc, drop column ai_draft, drop column status, drop column converted_at;
--   drop table conversations, shop_knowledge, shop_consult_settings, shop_channels;
--   drop function private.is_encrypted(text), private.is_hmac(text), private.consult_quota_ok(uuid), private.touch_updated_at();
--   ai_gate·ai_quota_ok는 20261102000700_ai_usage.sql 정의로 다시 만들고,
--   delete from private.app_settings where key in ('ai_model_consult', 'ai_consult_daily_calls_per_shop');
--   update private.app_settings set value = value - 'consult' where key = 'ai_features';

-- 형식 검사 -------------------------------------------------------------
create function private.is_encrypted(v text) returns boolean
language sql immutable set search_path = '' as $$ select v is null or v ~ '^v1\.[A-Za-z0-9+/]+={0,2}$' $$;
create function private.is_hmac(v text) returns boolean
language sql immutable set search_path = '' as $$ select v ~ '^[0-9a-f]{64}$' $$;

-- 채널 연결 -------------------------------------------------------------
create table shop_channels (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  channel text not null check (channel in ('kakao', 'instagram', 'kakao_cstalk')),
  public_token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'), -- 웹훅 주소용(추측 불가)
  external_id text check (length(external_id) <= 200),                                       -- 카카오 봇 id / 인스타 계정 id
  credentials_enc text check (private.is_encrypted(credentials_enc)),
  webhook_secret_enc text check (private.is_encrypted(webhook_secret_enc)),
  enabled boolean not null default false,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, channel)
);
alter table shop_channels enable row level security;
create policy member_read on shop_channels for select to authenticated using (private.is_shop_member(shop_id));
-- 비밀 열은 샵 관리자도 못 읽는다 (열 권한). 연결·해제는 이후 단계 RPC(P22-3·4)
revoke all on shop_channels from anon, authenticated;
grant select (id, shop_id, channel, external_id, enabled, token_expires_at, created_at, updated_at) on shop_channels to authenticated;

-- 상담 설정 (샵당 하나. 채널을 연결하기 전에도 안내 정보·켜기를 준비할 수 있게 채널과 따로 둔다)
create table shop_consult_settings (
  shop_id uuid primary key references shops(id) on delete cascade,
  auto_reply_enabled boolean not null default false, -- AI가 안내 정보 범위 사실만 바로 답한다(샵이 켠 경우만, CLAUDE.md 예외)
  ai_disclosure_text text not null default '안녕하세요! 이 답변은 AI가 샵 안내 정보로 드리는 자동 답변이에요. 예약·변경은 사장님이 직접 확인해 드려요.'
    check (length(ai_disclosure_text) between 1 and 300),
  disclose_first_reply boolean not null default true,
  confidence_threshold numeric(3, 2) not null default 0.85 check (confidence_threshold between 0.5 and 0.99),
  updated_at timestamptz not null default now()
);
alter table shop_consult_settings enable row level security;
create policy member_read on shop_consult_settings for select to authenticated using (private.is_shop_member(shop_id));
revoke insert, update, delete on shop_consult_settings from anon, authenticated;

-- 샵 안내 정보(지식 베이스) -------------------------------------------
create table shop_knowledge (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  kind text not null check (kind in ('price', 'hours', 'location', 'policy', 'faq', 'free_text')),
  title text not null check (length(btrim(title)) between 1 and 80),
  content text not null default '' check (length(content) <= 2000),
  is_active boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on shop_knowledge (shop_id, kind, sort);
alter table shop_knowledge enable row level security;
create policy member_all on shop_knowledge for all to authenticated
  using (private.is_shop_member(shop_id)) with check (private.is_shop_member(shop_id));

create function private.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger touch_updated_at before update on shop_knowledge for each row execute function private.touch_updated_at();

-- 대화·메시지 ------------------------------------------------------------
create table conversations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  channel text not null check (channel in ('kakao', 'instagram', 'kakao_cstalk')),
  channel_id uuid not null references shop_channels(id) on delete cascade,
  external_user_hash text not null check (private.is_hmac(external_user_hash)),
  display_name text check (length(display_name) <= 60),
  status text not null default 'bot' check (status in ('bot', 'waiting_owner', 'owner', 'closed')),
  last_customer_message_at timestamptz,
  summary text check (length(summary) <= 1000),
  disclosed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (channel_id, external_user_hash)
);
create index on conversations (shop_id, last_customer_message_at desc);
alter table conversations enable row level security;
create policy member_read on conversations for select to authenticated using (private.is_shop_member(shop_id));
revoke insert, update, delete on conversations from anon, authenticated;

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  shop_id uuid not null references shops(id) on delete cascade,
  channel text not null check (channel in ('kakao', 'instagram', 'kakao_cstalk')),
  role text not null check (role in ('customer', 'ai', 'owner', 'system')),
  text text not null check (length(text) <= 4000),
  intent text check (length(intent) <= 40),
  confidence numeric(4, 3) check (confidence between 0 and 1),
  prompt_version text check (length(prompt_version) <= 40),
  channel_message_id text check (length(channel_message_id) <= 200),
  sent_at timestamptz not null default now(),
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'sent', 'failed', 'skipped')),
  tag text check (length(tag) <= 40)
);
-- 채널이 준 메시지 id는 한 번만 (웹훅 재전송·replay 방지)
create unique index messages_channel_message_uniq on messages (channel, channel_message_id) where channel_message_id is not null;
create index on messages (conversation_id, sent_at);
create index on messages (shop_id, sent_at desc);
alter table messages enable row level security;
create policy member_read on messages for select to authenticated using (private.is_shop_member(shop_id));
revoke insert, update, delete on messages from anon, authenticated;

create table ai_feedback (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  shop_id uuid not null references shops(id) on delete cascade,
  kind text not null check (kind in ('wrong', 'edited')),
  corrected_text text check (length(corrected_text) <= 2000),
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table ai_feedback enable row level security;
create policy member_read on ai_feedback for select to authenticated using (private.is_shop_member(shop_id));
-- 사장님이 남긴다: 자기 샵 메시지에, 자기 이름으로
create policy member_insert on ai_feedback for insert to authenticated
  with check (private.is_shop_member(shop_id) and created_by = auth.uid()
              and exists (select 1 from public.messages m where m.id = message_id and m.shop_id = ai_feedback.shop_id));
revoke update, delete on ai_feedback from anon, authenticated;

-- 문의 확장 (기존 표, 화면·코드에서 아직 쓰지 않음) -------------------
alter table inquiries
  add column conversation_id uuid references conversations(id) on delete set null,
  add column type text check (type in ('lesson', 'rental', 'booking', 'complaint', 'other')),
  add column extracted jsonb not null default '{}',
  add column contact_enc text check (private.is_encrypted(contact_enc)),
  add column ai_draft text check (length(ai_draft) <= 2000),
  add column status text not null default 'open' check (status in ('open', 'replied', 'converted', 'closed')),
  add column converted_at timestamptz;
create index on inquiries (shop_id, status, created_at desc);

-- 기본 안내 템플릿 (비활성) -----------------------------------------------
create function private.consult_seed_shop(p_shop uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.shop_consult_settings (shop_id) values (p_shop) on conflict do nothing;
  insert into public.shop_knowledge (shop_id, kind, title, content, sort)
  select p_shop, t.kind, t.title, t.content, t.sort
  from (values
    ('price', '강습료', '예) 1:1 2시간 00원 / 1:2 2시간 1인 00원 / 그룹(3~10명) 1인 00원 — 실제 금액으로 바꿔 주세요', 10),
    ('price', '장비 대여료', '예) 스키·보드 세트 하루 00원, 의류 00원 — 실제 금액으로 바꿔 주세요', 20),
    ('hours', '영업시간', '예) 매일 오전 8시 ~ 오후 9시 (시즌 중 휴무 없음)', 30),
    ('location', '위치·찾아오는 길', '예) 리조트 정문에서 셔틀 정류장 맞은편 1층', 40),
    ('policy', '예약 변경·취소·환불', '예) 강습 하루 전까지 무료 변경, 당일 취소는 사장님께 문의', 50),
    ('policy', '준비물·복장', '예) 방수 장갑·고글, 장비는 대여 가능', 60),
    ('faq', '주차', '예) 리조트 주차장 이용(무료)', 70),
    ('faq', '어린이·단체 강습', '예) 만 5세부터, 10명 넘는 단체는 사장님께 문의', 80)
  ) as t(kind, title, content, sort)
  where not exists (select 1 from public.shop_knowledge k where k.shop_id = p_shop);
$$;
revoke all on function private.consult_seed_shop(uuid) from public, anon, authenticated;

create function private.consult_seed_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin perform private.consult_seed_shop(new.id); return new; end $$;
create trigger shop_consult_defaults after insert on shops for each row execute function private.consult_seed_trigger();

select private.consult_seed_shop(id) from shops;

-- 상담 설정 바꾸기 (샵 멤버). 자동응답 켜기·끄기는 감사 기록에 남긴다.
create function public.set_consult_settings(p_shop_id uuid, p_auto_reply boolean, p_disclosure text, p_disclose_first boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare old_auto boolean;
begin
  if not private.is_shop_member(p_shop_id) then
    raise exception '우리 샵 설정만 바꿀 수 있습니다' using errcode = '42501';
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
revoke execute on function public.set_consult_settings(uuid, boolean, text, boolean) from public, anon;
grant execute on function public.set_consult_settings(uuid, boolean, text, boolean) to authenticated;

-- 웹훅 쓰기 (서버 전용) ---------------------------------------------------
-- 손님 메시지 저장: 대화를 찾거나 만들고, 같은 채널 메시지 id면 저장하지 않는다(duplicate = true).
create function public.consult_record_customer_message(p_channel_id uuid, p_user_hash text, p_display_name text,
                                                       p_channel_message_id text, p_text text)
returns table (conversation_id uuid, message_id uuid, duplicate boolean)
language plpgsql security definer set search_path = '' as $$
declare ch public.shop_channels; conv uuid; msg uuid;
begin
  select * into ch from public.shop_channels where id = p_channel_id;
  if ch.id is null then raise exception '없는 채널입니다' using errcode = '22023'; end if;
  insert into public.conversations (shop_id, channel, channel_id, external_user_hash, display_name, last_customer_message_at)
  values (ch.shop_id, ch.channel, ch.id, p_user_hash, left(p_display_name, 60), now())
  on conflict (channel_id, external_user_hash)
    do update set last_customer_message_at = now(), display_name = coalesce(excluded.display_name, public.conversations.display_name)
  returning id into conv;
  insert into public.messages (conversation_id, shop_id, channel, role, text, channel_message_id, delivery_status)
  values (conv, ch.shop_id, ch.channel, 'customer', left(coalesce(p_text, ''), 4000), p_channel_message_id, 'skipped')
  on conflict (channel, channel_message_id) where channel_message_id is not null do nothing
  returning id into msg;
  return query select conv, msg, msg is null;
end $$;

-- AI·시스템 답변 저장 (발송 결과 포함)
create function public.consult_record_reply(p_conversation_id uuid, p_role text, p_text text, p_intent text,
                                            p_confidence numeric, p_prompt_version text, p_delivery_status text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.conversations; msg uuid;
begin
  select * into c from public.conversations where id = p_conversation_id;
  if c.id is null then raise exception '없는 대화입니다' using errcode = '22023'; end if;
  if p_role not in ('ai', 'system') then raise exception '서버는 ai·system 답변만 남깁니다' using errcode = '22023'; end if;
  insert into public.messages (conversation_id, shop_id, channel, role, text, intent, confidence, prompt_version, delivery_status)
  values (c.id, c.shop_id, c.channel, p_role, left(p_text, 4000), p_intent, p_confidence, p_prompt_version, p_delivery_status)
  returning id into msg;
  return msg;
end $$;

-- 사람이 처리할 문의 열기 (escalate). 대화는 사장님 대기로.
create function public.consult_open_inquiry(p_conversation_id uuid, p_type text, p_extracted jsonb, p_ai_draft text, p_contact_enc text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.conversations; inq uuid;
begin
  select * into c from public.conversations where id = p_conversation_id;
  if c.id is null then raise exception '없는 대화입니다' using errcode = '22023'; end if;
  insert into public.inquiries (shop_id, channel, conversation_id, type, extracted, ai_draft, contact_enc)
  values (c.shop_id, c.channel, c.id, coalesce(p_type, 'other'), coalesce(p_extracted, '{}'), left(p_ai_draft, 2000), p_contact_enc)
  returning id into inq;
  update public.conversations set status = 'waiting_owner' where id = c.id and status = 'bot';
  return inq;
end $$;

revoke execute on function public.consult_record_customer_message(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.consult_record_reply(uuid, text, text, text, numeric, text, text) from public, anon, authenticated;
revoke execute on function public.consult_open_inquiry(uuid, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.consult_record_customer_message(uuid, text, text, text, text) to service_role;
grant execute on function public.consult_record_reply(uuid, text, text, text, numeric, text, text) to service_role;
grant execute on function public.consult_open_inquiry(uuid, text, jsonb, text, text) to service_role;

-- AI 상한: 상담 전용 하루 상한, 기존 상한에서는 상담을 뺀다 -------------
insert into private.app_settings (key, value, note) values
  ('ai_model_consult', '"claude-haiku-5-5"', 'AI 상담 모델(지연이 짧은 모델)'),
  ('ai_consult_daily_calls_per_shop', '300', '샵별 하루 AI 상담 호출 상한(다른 AI 기능 상한과 별도)');
update private.app_settings set value = value || '{"consult": true}' where key = 'ai_features';

create or replace function private.ai_quota_ok(p_shop_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select count(*) < private.setting_int('ai_daily_calls_per_shop')
  from public.ai_usage
  where shop_id = p_shop_id and feature <> 'consult'
    and created_at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
$$;

create function private.consult_quota_ok(p_shop_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select count(*) < private.setting_int('ai_consult_daily_calls_per_shop')
  from public.ai_usage
  where shop_id = p_shop_id and feature = 'consult'
    and created_at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
$$;
revoke all on function private.consult_quota_ok(uuid) from public, anon, authenticated;

create or replace function public.ai_gate(p_shop_id uuid, p_feature text)
returns table (allowed boolean, reason text, model text)
language plpgsql security definer set search_path = '' as $$
declare
  m text := (select value #>> '{}' from private.app_settings
             where key = case when p_feature in ('cert', 'bid_assist') then 'ai_model_vision'
                              when p_feature = 'consult' then 'ai_model_consult' else 'ai_model_text' end);
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
