import "server-only";
import { runConsult } from "@/lib/ai/consult/engine";
import { overLimit } from "@/lib/ops/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { postKakaoCallback } from "./adapter";
import { KAKAO_BUDGET_MS, type KakaoChannelRow, type KakaoWebhookDeps, type ReplyContext } from "./webhook";

// 카카오 웹훅의 실제 의존성: 서비스 키 클라이언트 + security definer RPC(consult_record_customer_message·consult_record_reply·consult_open_inquiry).
// 손님 상담 표(conversations·inquiries)는 로그인 사용자가 쓰지 못하고, 서버(service_role)만 쓴다.
export function kakaoDeps(defer: KakaoWebhookDeps["defer"]): KakaoWebhookDeps {
  const db = createAdminClient();
  return {
    hashKey: () => {
      const k = process.env.CONSULT_HASH_KEY;
      return k && k.length >= 32 ? k : null;
    },
    async findChannel(token) {
      const { data, error } = await db.from("shop_channels").select("id, shop_id, channel, external_id, enabled").eq("public_token", token).maybeSingle();
      if (error) throw error;
      return (data as KakaoChannelRow | null) ?? null;
    },
    async recordCustomerMessage(m) {
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
    rateOk: async (name, subject) => (await overLimit([[name, subject]])) === null,
    runConsult: (input) => runConsult(input),
    async replyContext(shopId, conversationId): Promise<ReplyContext> {
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
    async recordReply(r) {
      const { error } = await db.rpc("consult_record_reply", {
        p_conversation_id: r.conversationId,
        p_role: r.role,
        p_text: r.text,
        p_intent: r.intent,
        p_confidence: r.confidence,
        p_prompt_version: r.promptVersion,
        p_delivery_status: r.delivery,
      });
      if (error) throw error;
    },
    // 같은 대화에 아직 열린 문의가 있으면 새로 만들지 않고 초안·추출 정보만 새로 고친다(손님이 여러 번 나눠 보내도 문의는 하나)
    async openInquiry(i) {
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
    async markDisclosed(conversationId) {
      const { error } = await db.from("conversations").update({ disclosed_at: new Date().toISOString() }).eq("id", conversationId).is("disclosed_at", null);
      if (error) throw error;
    },
    postCallback: (url, body) => postKakaoCallback(url, body),
    defer,
    now: () => Date.now(),
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    budgetMs: KAKAO_BUDGET_MS,
    log: (e) => console.info("kakao webhook", JSON.stringify(e)),
  };
}
