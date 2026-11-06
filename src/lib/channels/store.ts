import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/ai/consult/crypto";
import type { Extracted, LicenseState } from "@/lib/ai/consult/types";
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

// 손님 연락처(손님 글에서 서버 규칙으로 뽑은 값)는 암호화해서만 둔다. 키가 없거나 실패하면 두지 않는다(가린 글은 메시지에 남는다).
export function encryptContact(contact: string | null | undefined, encrypt: (v: string) => string = encryptSecret): string | null {
  if (!contact) return null;
  try {
    return encrypt(contact);
  } catch {
    return null;
  }
}

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
    // AI 상담 사용권 (P23-2): 쿼리 1개. 스위치가 꺼져 있으면 DB가 언제나 ok. 오류면 ok로 보고 DB 게이트(ai_gate)가 다시 막는다
    async licenseState(shopId: string): Promise<LicenseState> {
      const { data, error } = await db.rpc("consult_license_check", { p_shop_id: shopId });
      if (error) return "ok";
      return data === "no_license" || data === "monthly_quota" ? data : "ok";
    },
    async hasOpenInquiry(conversationId: string) {
      const { count, error } = await db.from("inquiries").select("id", { count: "exact", head: true }).eq("conversation_id", conversationId).eq("status", "open");
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    // 같은 대화에 아직 열린 문의가 있으면 새로 만들지 않고 초안·추출 정보(·새 연락처)만 새로 고친다(손님이 여러 번 나눠 보내도 문의는 하나)
    async openInquiry(i: { conversationId: string; type: InquiryType; extracted: Extracted | undefined; draft: string | undefined; contact?: string | null }) {
      const contactEnc = encryptContact(i.contact);
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
        if (contactEnc) patch.contact_enc = contactEnc;
        const { error } = await db.from("inquiries").update(patch).eq("id", open.id);
        if (error) throw error;
        return;
      }
      const { error } = await db.rpc("consult_open_inquiry", {
        p_conversation_id: i.conversationId,
        p_type: i.type,
        p_extracted: i.extracted ?? {},
        p_ai_draft: i.draft ?? null,
        p_contact_enc: contactEnc,
      });
      if (error) throw error;
    },
    // 인스타 손님 id(암호화한 값)를 대화에 둔다 — 사장님 승인 발송(P22-5)에서만 푼다. 샵 관리자도 이 열은 못 읽는다(열 권한).
    async saveReplyTarget(conversationId: string, replyToEnc: string) {
      const { error } = await db.from("conversations").update({ reply_to_enc: replyToEnc }).eq("id", conversationId);
      if (error) throw error;
    },
    async markDisclosed(conversationId: string) {
      const { error } = await db.from("conversations").update({ disclosed_at: new Date().toISOString() }).eq("id", conversationId).is("disclosed_at", null);
      if (error) throw error;
    },
  };
}
