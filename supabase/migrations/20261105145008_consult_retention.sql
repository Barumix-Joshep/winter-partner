-- P22-6 AI 상담 보존 기간 정리·[강습 등록] (docs/ai-consult/README.md "보안·개인정보", 사장님 결정 3)
-- - public.purge_consult_data() (서버 전용, 매일 정리 작업 /api/maintenance/daily가 부른다):
--   90일이 지난 상담을 지운다.
--   1) 마지막 활동(대화 생성·손님 마지막 메시지·마지막 메시지 중 가장 늦은 시각)이 90일 전인 대화 → 대화 삭제(메시지·피드백은 함께 삭제)
--   2) 남는 대화 안에서도 90일 지난 메시지 → 삭제(피드백은 함께 삭제)
--   3) 지우는 대화에 이어진 문의: "강습 등록"으로 넘긴 것(status 'converted')은 남기되 연락처(contact_enc)·대화 연결(conversation_id)·
--      AI 초안(ai_draft, 손님 글로 만든 글)을 비운다. 나머지 문의는 함께 삭제한다. 대화와 이어지지 않은 문의(상담 이전 기능)는 건드리지 않는다.
--   돌려주는 값: 지운 대화·메시지·피드백·문의 수, 연락처를 지우고 남긴 문의 수 (개인 정보 없음)
-- - public.consult_convert_inquiry(p_inquiry_id): [강습 등록] — 샵 대표(is_owner)만 문의를 converted로(답장 전·답장함만). 감사 기록.
-- - inquiries 고치기 권한을 열 단위로: 상태(status·converted_at)·연락처·대화 연결·초안은 RPC(서버·대표)로만 바꾼다.
--   샵 멤버가 직접 고칠 수 있는 열은 기존 열(customer_id·channel·outcome·lost_reason·type·extracted)만.
-- - 데이터 변경: **적용할 때는 없음**(함수·권한만). 삭제는 병합·배포 뒤 매일 정리 작업이 이 함수를 부를 때부터 일어난다
--   (운영에는 아직 90일 지난 상담이 없다 — 상담 표는 2026-11-05 생성).
--
-- 되돌리기:
--   drop function public.purge_consult_data(), public.consult_convert_inquiry(uuid);
--   grant update on public.inquiries to authenticated;
--   (지운 상담은 되돌릴 수 없다 — 백업에서만. 정리 작업만 멈추려면 /api/maintenance/daily에서 purge_consult_data 호출을 빼고 배포한다)

-- 보존 기간 정리 (서버 전용) ------------------------------------------------
create function public.purge_consult_data()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  cutoff timestamptz := now() - interval '90 days';
  old_conv uuid[];
  n_conv int; n_msg int; n_old_msg int; n_fb int; n_old_fb int; n_inq int; n_kept int;
begin
  old_conv := array(
    select c.id
    from public.conversations c
    where greatest(c.created_at, coalesce(c.last_customer_message_at, c.created_at),
                   coalesce((select max(m.sent_at) from public.messages m where m.conversation_id = c.id), c.created_at)) < cutoff);

  -- 문의 먼저 (대화를 지우면 conversation_id가 null이 되어 어느 문의였는지 알 수 없으므로)
  update public.inquiries
     set contact_enc = null, conversation_id = null, ai_draft = null
   where conversation_id = any(old_conv) and status = 'converted';
  get diagnostics n_kept = row_count;
  delete from public.inquiries where conversation_id = any(old_conv);
  get diagnostics n_inq = row_count;

  -- 대화 (메시지·피드백은 외래 키 on delete cascade로 함께)
  select count(*) into n_msg from public.messages where conversation_id = any(old_conv);
  select count(*) into n_fb from public.ai_feedback f join public.messages m on m.id = f.message_id where m.conversation_id = any(old_conv);
  delete from public.conversations where id = any(old_conv);
  get diagnostics n_conv = row_count;

  -- 남는 대화 안의 오래된 메시지
  select count(*) into n_old_fb from public.ai_feedback f join public.messages m on m.id = f.message_id where m.sent_at < cutoff;
  delete from public.messages where sent_at < cutoff;
  get diagnostics n_old_msg = row_count;

  return jsonb_build_object(
    'conversations', n_conv,
    'messages', n_msg + n_old_msg,
    'feedback', n_fb + n_old_fb,
    'inquiries_deleted', n_inq,
    'inquiries_kept', n_kept
  );
end $$;
revoke execute on function public.purge_consult_data() from public, anon, authenticated;
grant execute on function public.purge_consult_data() to service_role;

-- [강습 등록] (샵 대표) -------------------------------------------------------
create function public.consult_convert_inquiry(p_inquiry_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.inquiries;
begin
  select * into i from public.inquiries where id = p_inquiry_id;
  -- 없는 문의·다른 샵 문의·대표가 아닌 멤버는 같은 오류
  if i.id is null or not private.is_shop_owner(i.shop_id) then
    raise exception '샵 대표만 강습 등록으로 넘길 수 있습니다' using errcode = '42501';
  end if;
  if i.status not in ('open', 'replied') then
    raise exception '답장 전·답장한 문의만 강습 등록으로 넘길 수 있습니다' using errcode = '22023';
  end if;
  update public.inquiries set status = 'converted', converted_at = now() where id = i.id;
  perform private.audit(i.shop_id, 'consult_inquiry_converted', 'inquiries', i.id, jsonb_build_object('from', i.status));
end $$;
revoke execute on function public.consult_convert_inquiry(uuid) from public, anon;
grant execute on function public.consult_convert_inquiry(uuid) to authenticated;

-- inquiries 고치기 권한: 상태·연락처·대화 연결·초안은 RPC로만 ------------------
revoke update on public.inquiries from authenticated;
grant update (customer_id, channel, outcome, lost_reason, type, extracted) on public.inquiries to authenticated;
