-- P22-4 인스타그램 DM 상담 연결 (docs/ai-consult/README.md "채널 흐름 — 인스타")
-- - 답변 기록에 발송 태그(HUMAN_AGENT 등)를 남긴다: consult_record_reply에 p_tag(기본 null)를 더한다.
--   기존 7개 인자 호출(카카오 P22-3)은 그대로 동작한다.
-- - 인스타 계정 하나는 샵 하나에만 연결한다(웹훅의 수신 계정 id로 샵을 찾으므로).
-- - 연결(서버 전용): Instagram 로그인 OAuth 콜백이 서비스 키로 부른다. 토큰은 앱에서 암호화한 값("v1.")만 받는다.
--   샵 멤버인지는 함수가 p_actor로 다시 확인한다(service_role에는 auth.uid()가 없다).
-- - 해제(샵 멤버): 토큰·계정 id를 지우고 끈다. 대화 기록은 남긴다(90일 정리 작업 대상).
-- - 데이터 변경: 없음(함수·색인만). 색인은 기존 인스타 행이 없으면(현재 0행) 바로 만들어진다.
--
-- 되돌리기:
--   drop function public.consult_connect_instagram(uuid, uuid, text, text, timestamptz), public.consult_disconnect_channel(uuid, text);
--   drop index public.shop_channels_instagram_account_uniq;
--   drop function public.consult_record_reply(uuid, text, text, text, numeric, text, text, text);
--   그리고 20261105114656_consult_schema.sql의 consult_record_reply(7개 인자) 정의와 revoke/grant를 다시 실행한다.

-- 답변 기록 (태그 포함) ---------------------------------------------------
drop function public.consult_record_reply(uuid, text, text, text, numeric, text, text);
create function public.consult_record_reply(p_conversation_id uuid, p_role text, p_text text, p_intent text,
                                            p_confidence numeric, p_prompt_version text, p_delivery_status text,
                                            p_tag text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.conversations; msg uuid;
begin
  select * into c from public.conversations where id = p_conversation_id;
  if c.id is null then raise exception '없는 대화입니다' using errcode = '22023'; end if;
  if p_role not in ('ai', 'system') then raise exception '서버는 ai·system 답변만 남깁니다' using errcode = '22023'; end if;
  insert into public.messages (conversation_id, shop_id, channel, role, text, intent, confidence, prompt_version, delivery_status, tag)
  values (c.id, c.shop_id, c.channel, p_role, left(p_text, 4000), p_intent, p_confidence, p_prompt_version, p_delivery_status, p_tag)
  returning id into msg;
  return msg;
end $$;
revoke execute on function public.consult_record_reply(uuid, text, text, text, numeric, text, text, text) from public, anon, authenticated;
grant execute on function public.consult_record_reply(uuid, text, text, text, numeric, text, text, text) to service_role;

-- 인스타 계정 하나 = 샵 하나 -----------------------------------------------
create unique index shop_channels_instagram_account_uniq on public.shop_channels (external_id)
  where channel = 'instagram' and external_id is not null;

-- 연결 (서버 전용) ----------------------------------------------------------
create function public.consult_connect_instagram(p_shop_id uuid, p_actor uuid, p_external_id text, p_credentials_enc text,
                                                 p_token_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare ch uuid;
begin
  if p_actor is null or not exists (select 1 from public.shop_members where shop_id = p_shop_id and user_id = p_actor) then
    raise exception '우리 샵에만 연결할 수 있습니다' using errcode = '42501';
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
revoke execute on function public.consult_connect_instagram(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.consult_connect_instagram(uuid, uuid, text, text, timestamptz) to service_role;

-- 해제 (샵 멤버) ------------------------------------------------------------
create function public.consult_disconnect_channel(p_shop_id uuid, p_channel text)
returns void language plpgsql security definer set search_path = '' as $$
declare ch uuid;
begin
  if not private.is_shop_member(p_shop_id) then
    raise exception '우리 샵 채널만 해제할 수 있습니다' using errcode = '42501';
  end if;
  update public.shop_channels
     set enabled = false, credentials_enc = null, token_expires_at = null,
         external_id = case when channel = 'instagram' then null else external_id end, updated_at = now()
   where shop_id = p_shop_id and channel = p_channel
  returning id into ch;
  if ch is not null then
    perform private.audit(p_shop_id, 'consult_channel_disconnected', 'shop_channels', ch, jsonb_build_object('channel', p_channel));
  end if;
end $$;
revoke execute on function public.consult_disconnect_channel(uuid, text) from public, anon;
grant execute on function public.consult_disconnect_channel(uuid, text) to authenticated;
