import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { Extracted } from "@/lib/ai/consult/types";
import type { DeliveryStatus } from "./types";

// 채널 웹훅(카카오·인스타)이 같이 쓰는 상담 저장: 서비스 키 클라이언트 + security definer RPC
// (consult_record_customer_message·consult_record_reply·consult_open_inquiry). 손님 상담 표는 로그인 사용자가 쓰지 못하고 서버만 쓴다.
type Db = ReturnType<typeof createAdminClient>;
export type InquiryType = "lesson" | "rental" | "booking" | "complaint" | "other";
export type ReplyContext = { disclosureText: string; discloseFirst: boolean; disclosedAt: string | null };
export type ReplyRecord = {
  conversationId: string;
  role: "ai" | "system";
  text: string;
  intent: string;
  confidence: number;
  promptVersion: string;
  delivery: DeliveryStatus;
  tag?: string | null; // 인스타 RESPONSE·HUMAN_AGENT
};

export function consultStore(db: Db) {
  return {
    async recordCustomerMessage(m: { channelId: string; userHash: string; messageId: string; text: string }) {
      const { data, error } = await db.rpc("consult_record_customer_message", {
        p_channel_id: m.channelId,
        p_user_hash: m.userHash,
        p_display_name: null,
        p_channel_message_id: m.messageId,
        p_text: m.text,
      });
      const row = ((data ?? []) as { conversation_id: string; duplicate: boolean }[])[0];
      if (error || !row) return null;
      return { conversationId: row.conversation_id, duplicate: row.duplicate };
    },
    async replyContext(shopId: string, conversationId: string): Promise<ReplyContext> {
      const [{ data: s }, { data: c }] = await Promise.all([
        db.from("shop_consult_settings").select("ai_disclosure_text, disclose_first_reply").eq("shop_id", shopId).maybeSingle(),
        db.from("conversations").select("disclosed_at").eq("id", conversationId).maybeSingle(),
      ]);
      return {
        disclosureText: (s?.ai_disclosure_text as string | undefined) ?? "",
        discloseFirst: s?.disclose_first_reply !== false,
        disclosedAt: (c?.disclosed_at as string | null | undefined) ?? null,
      };
    },
    // 태그가 없으면 p_tag를 보내지 않는다(카카오는 태그가 없다)
    async recordReply(r: ReplyRecord) {
      const { error } = await db.rpc("consult_record_reply", {
        p_conversation_id: r.conversationId,
        p_role: r.role,
        p_text: r.text,
        p_intent: r.intent,
        p_confidence: r.confidence,
        p_prompt_version: r.promptVersion,
        p_delivery_status: r.delivery,
        ...(r.tag ? { p_tag: r.tag } : {}),
      });
      if (error) throw error;
    },
    async hasOpenInquiry(conversationId: string) {
      const { count, error } = await db.from("inquiries").select("id", { count: "exact", head: true }).eq("conversation_id", conversationId).eq("status", "open");
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    // 같은 대화에 아직 열린 문의가 있으면 새로 만들지 않고 초안·추출 정보만 새로 고친다(손님이 여러 번 나눠 보내도 문의는 하나)
    async openInquiry(i: { conversationId: string; type: InquiryType; extracted: Extracted | undefined; draft: string | undefined }) {
      const { data: open } = await db
        .from("inquiries")
        .select("id, extracted")
        .eq("conversation_id", i.conversationId)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (open) {
        const patch: Record<string, unknown> = { extracted: { ...((open.extracted as object) ?? {}), ...(i.extracted ?? {}) } };
        if (i.draft) patch.ai_draft = i.draft.slice(0, 2000);
        const { error } = await db.from("inquiries").update(patch).eq("id", open.id);
        if (error) throw error;
        return;
      }
      const { error } = await db.rpc("consult_open_inquiry", {
        p_conversation_id: i.conversationId,
        p_type: i.type,
        p_extracted: i.extracted ?? {},
        p_ai_draft: i.draft ?? null,
        p_contact_enc: null,
      });
      if (error) throw error;
    },
    async markDisclosed(conversationId: string) {
      const { error } = await db.from("conversations").update({ disclosed_at: new Date().toISOString() }).eq("id", conversationId).is("disclosed_at", null);
      if (error) throw error;
    },
  };
}
