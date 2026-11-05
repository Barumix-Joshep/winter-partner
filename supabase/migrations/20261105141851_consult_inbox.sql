-- P22-5 사장님 인박스 (docs/ai-consult/README.md "화면")
-- - 사장님 답장 기록(샵 멤버): messages·conversations·inquiries는 로그인 사용자가 직접 쓰지 못하므로(P22-1) security definer RPC로만.
--   consult_owner_reply: 사장님 답장(role owner)·발송 결과·태그를 남기고, 보냈거나(sent) 직접 보낸 경우(skipped, 카카오 복사)
--   열린 문의를 replied로, 대화를 owner로 바꾼다. 카카오·상담톡은 우리가 보낼 수 없으므로 skipped만 받는다. 감사 기록에 남긴다.
--   consult_close_conversation: 대화를 닫고 열린 문의를 closed로.
-- - 인스타 사장님 승인 발송용 손님 id: conversations.reply_to_enc (앱에서 암호화한 "v1." 값만, 서버만 쓴다).
--   샵 관리자도 이 열은 읽지 못한다(열 권한: conversations의 select를 열 단위로 다시 준다).
-- - consult_open_inquiry: 사장님이 답했거나 닫은 대화에 새 문의가 오면 다시 사장님 대기(waiting_owner)로 (전에는 bot일 때만 바꿨다).
-- - 데이터 변경: 없음(열 추가는 null, 함수·권한만).
--
-- 되돌리기:
--   drop function public.consult_owner_reply(uuid, text, text, text), public.consult_close_conversation(uuid);
--   alter table public.conversations drop column reply_to_enc;
--   grant select on public.conversations to authenticated;
--   그리고 20261105114656_consult_schema.sql의 consult_open_inquiry 정의를 다시 실행한다(revoke/grant 포함).

-- 인스타 손님 id (암호화) ----------------------------------------------------
alter table public.conversations add column reply_to_enc text check (private.is_encrypted(reply_to_enc));
revoke select on public.conversations from authenticated;
grant select (id, shop_id, channel, channel_id, external_user_hash, display_name, status, last_customer_message_at, summary, disclosed_at, created_at)
  on public.conversations to authenticated;

-- 사장님 답장 기록 (샵 멤버) ------------------------------------------------
create function public.consult_owner_reply(p_conversation_id uuid, p_text text, p_delivery_status text, p_tag text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.conversations; msg uuid;
begin
  select * into c from public.conversations where id = p_conversation_id;
  -- 없는 대화도 같은 오류(다른 샵 대화가 있는지 알려 주지 않는다)
  if c.id is null or not private.is_shop_member(c.shop_id) then
    raise exception '우리 샵 대화에만 답할 수 있습니다' using errcode = '42501';
  end if;
  if p_text is null or length(btrim(p_text)) not between 1 and 2000 then
    raise exception '답장은 1~2000자로 적어 주세요' using errcode = '22023';
  end if;
  if p_delivery_status is null or p_delivery_status not in ('sent', 'failed', 'skipped') then
    raise exception '발송 결과 값이 아닙니다' using errcode = '22023';
  end if;
  if p_tag is not null and p_tag not in ('RESPONSE', 'HUMAN_AGENT') then
    raise exception '발송 태그 값이 아닙니다' using errcode = '22023';
  end if;
  -- 카카오(무료 챗봇)·상담톡은 우리가 먼저 보낼 수 없다 → 사장님이 1:1 채팅에서 직접 보낸 것(skipped)만
  if c.channel <> 'instagram' and (p_delivery_status <> 'skipped' or p_tag is not null) then
    raise exception '카카오 대화는 직접 보낸 답장만 기록합니다' using errcode = '22023';
  end if;
  insert into public.messages (conversation_id, shop_id, channel, role, text, delivery_status, tag)
  values (c.id, c.shop_id, c.channel, 'owner', btrim(p_text), p_delivery_status, p_tag)
  returning id into msg;
  if p_delivery_status in ('sent', 'skipped') then
    update public.inquiries set status = 'replied' where conversation_id = c.id and status = 'open';
    update public.conversations set status = 'owner' where id = c.id and status in ('bot', 'waiting_owner');
  end if;
  perform private.audit(c.shop_id, 'consult_owner_reply', 'messages', msg,
                        jsonb_build_object('channel', c.channel, 'delivery', p_delivery_status, 'tag', p_tag));
  return msg;
end $$;
revoke execute on function public.consult_owner_reply(uuid, text, text, text) from public, anon;
grant execute on function public.consult_owner_reply(uuid, text, text, text) to authenticated;

-- 대화 닫기 (샵 멤버) --------------------------------------------------------
create function public.consult_close_conversation(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.conversations;
begin
  select * into c from public.conversations where id = p_conversation_id;
  if c.id is null or not private.is_shop_member(c.shop_id) then
    raise exception '우리 샵 대화만 닫을 수 있습니다' using errcode = '42501';
  end if;
  update public.conversations set status = 'closed' where id = c.id;
  update public.inquiries set status = 'closed' where conversation_id = c.id and status = 'open';
end $$;
revoke execute on function public.consult_close_conversation(uuid) from public, anon;
grant execute on function public.consult_close_conversation(uuid) to authenticated;

-- 문의 열기 (서버 전용): 사장님이 답했거나 닫은 대화도 새 문의면 다시 사장님 대기로 ------------
create or replace function public.consult_open_inquiry(p_conversation_id uuid, p_type text, p_extracted jsonb, p_ai_draft text, p_contact_enc text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.conversations; inq uuid;
begin
  select * into c from public.conversations where id = p_conversation_id;
  if c.id is null then raise exception '없는 대화입니다' using errcode = '22023'; end if;
  insert into public.inquiries (shop_id, channel, conversation_id, type, extracted, ai_draft, contact_enc)
  values (c.shop_id, c.channel, c.id, coalesce(p_type, 'other'), coalesce(p_extracted, '{}'), left(p_ai_draft, 2000), p_contact_enc)
  returning id into inq;
  update public.conversations set status = 'waiting_owner' where id = c.id and status <> 'waiting_owner';
  return inq;
end $$;
revoke execute on function public.consult_open_inquiry(uuid, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.consult_open_inquiry(uuid, text, jsonb, text, text) to service_role;
