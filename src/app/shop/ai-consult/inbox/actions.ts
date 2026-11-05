"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyShop } from "@/lib/shop/my-shop";
import { decryptSecret } from "@/lib/ai/consult/crypto";
import { InstagramAdapter } from "@/lib/channels/instagram/adapter";
import { instagramConfig } from "@/lib/channels/instagram/config";
import { feedbackRow, inboxVersion, ownerTextError } from "@/lib/channels/inbox";
import { ownerSendInstagram } from "@/lib/channels/owner-reply";

// 사장님 인박스(P22-5) 서버 액션. 읽기·쓰기는 세션 클라이언트 + RLS·샵 멤버 RPC.
// 서비스 키는 인스타 승인 발송에서 토큰·손님 id(암호화 열, 샵 관리자도 못 읽음)를 읽을 때만 쓰고, 그 전에 세션으로 대화가 우리 샵인지 확인한다.
// 로그에 손님 글·답장 글을 쓰지 않는다.

export type InboxState = { ok?: boolean; message?: string };
const INBOX = "/shop/ai-consult/inbox";

async function myShopId() {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  return shop?.id ?? null;
}

// 화면이 열려 있는 동안 10초마다 부른다(live.tsx). 값이 바뀌었을 때만 화면을 다시 그린다 — 쿼리 2개, 행은 읽지 않는다.
export async function inboxPulse(): Promise<string | null> {
  const shopId = await myShopId();
  if (!shopId) return null;
  const supabase = await createClient();
  const [{ count }, { data: last }] = await Promise.all([
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("status", "waiting_owner"),
    supabase.from("messages").select("sent_at").eq("shop_id", shopId).order("sent_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return inboxVersion(count ?? 0, (last?.sent_at as string | undefined) ?? null);
}

// 세션(RLS)으로 대화를 읽는다 — 다른 샵 대화면 null
async function myConversation(conversationId: string) {
  const shopId = await myShopId();
  if (!shopId || !/^[0-9a-f-]{36}$/i.test(conversationId)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("conversations").select("id, shop_id, channel, channel_id").eq("id", conversationId).eq("shop_id", shopId).maybeSingle();
  return data ? { supabase, conv: data as { id: string; shop_id: string; channel: string; channel_id: string } } : null;
}

// [승인·발송(인스타)]: 사장님 승인 경로(24시간 안 RESPONSE, 24시간~7일은 Human Agent가 켜진 경우만, 7일 초과 거부)
export async function approveSend(_prev: InboxState | undefined, formData: FormData): Promise<InboxState> {
  const id = String(formData.get("conversation_id") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  const mine = await myConversation(id);
  if (!mine) return { message: "대화를 찾지 못했어요." };
  if (mine.conv.channel !== "instagram") return { message: "인스타그램 대화만 여기서 보낼 수 있어요." };
  const bad = ownerTextError(text, "instagram");
  if (bad) return { message: bad };
  const cfg = instagramConfig();
  if (!cfg) return { message: "인스타그램 연결이 아직 준비 중이에요. 인스타그램 앱에서 직접 답해 주세요." };
  const db = createAdminClient();
  const res = await ownerSendInstagram(
    {
      async loadTarget(conversationId) {
        const [{ data: c }, { data: ch }] = await Promise.all([
          db.from("conversations").select("id, channel, reply_to_enc, last_customer_message_at").eq("id", conversationId).eq("shop_id", mine.conv.shop_id).maybeSingle(),
          db.from("shop_channels").select("enabled, external_id, credentials_enc").eq("id", mine.conv.channel_id).eq("shop_id", mine.conv.shop_id).maybeSingle(),
        ]);
        if (!c || !ch) return null;
        return {
          conversationId: c.id as string,
          channel: c.channel as string,
          enabled: !!ch.enabled,
          accountId: (ch.external_id as string | null) ?? null,
          credentialsEnc: (ch.credentials_enc as string | null) ?? null,
          replyToEnc: (c.reply_to_enc as string | null) ?? null,
          lastCustomerMessageAt: (c.last_customer_message_at as string | null) ?? null,
        };
      },
      decrypt: (enc) => decryptSecret(enc),
      makeSender: (accountId, accessToken) => new InstagramAdapter({ config: cfg, accountId, accessToken }),
      // 기록은 세션 클라이언트로(RPC가 샵 멤버를 다시 확인하고 보낸 사람 이름으로 감사 기록)
      async record(r) {
        const { error } = await mine.supabase.rpc("consult_owner_reply", { p_conversation_id: r.conversationId, p_text: r.text, p_delivery_status: r.delivery, p_tag: r.tag });
        if (error) throw error;
      },
    },
    id,
    text,
  ).catch(() => ({ ok: false, message: "처리하지 못했어요. 잠시 뒤 다시 시도해 주세요." }));
  console.info("consult inbox", JSON.stringify({ action: "approve_send", ok: res.ok, len: text.length }));
  revalidatePath(`${INBOX}/${id}`);
  return res;
}

// [복사(카카오)]: 화면이 클립보드에 복사한 뒤 부른다. 사장님이 채널 1:1 채팅에서 직접 보내므로 skipped로 남기고 문의를 replied로.
export async function markCopied(_prev: InboxState | undefined, formData: FormData): Promise<InboxState> {
  const id = String(formData.get("conversation_id") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  const mine = await myConversation(id);
  if (!mine) return { message: "대화를 찾지 못했어요." };
  if (mine.conv.channel === "instagram") return { message: "인스타그램은 [승인·발송]을 눌러 주세요." };
  const bad = ownerTextError(text, mine.conv.channel);
  if (bad) return { message: bad };
  const { error } = await mine.supabase.rpc("consult_owner_reply", { p_conversation_id: id, p_text: text, p_delivery_status: "skipped", p_tag: null });
  if (error) return { message: "답장 처리로 바꾸지 못했어요. 다시 눌러 주세요." };
  revalidatePath(`${INBOX}/${id}`);
  return { ok: true, message: "복사했어요. 카카오톡 채널 1:1 채팅에 붙여 넣어 보내 주세요. 문의는 답장함으로 바꿨어요." };
}

// [AI 답변 틀림]: AI·안내 메시지에 피드백(고친 글이 있으면 edited). RLS member_insert가 자기 샵 메시지·자기 이름만 허용한다.
export async function markWrong(_prev: InboxState | undefined, formData: FormData): Promise<InboxState> {
  const shopId = await myShopId();
  if (!shopId) return { message: "샵 정보를 찾지 못했어요." };
  const messageId = String(formData.get("message_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(messageId)) return { message: "틀린 답변을 찾지 못했어요." };
  const row = feedbackRow(String(formData.get("draft") ?? ""), formData.get("edited") as string | null);
  const supabase = await createClient();
  const { error } = await supabase.from("ai_feedback").insert({ message_id: messageId, shop_id: shopId, ...row });
  if (error) return { message: "기록하지 못했어요. 다시 시도해 주세요." };
  return { ok: true, message: row.kind === "edited" ? "고친 답과 함께 'AI 답변 틀림'으로 기록했어요." : "'AI 답변 틀림'으로 기록했어요." };
}

export async function closeConversation(formData: FormData) {
  const id = String(formData.get("conversation_id") ?? "");
  const mine = await myConversation(id);
  if (!mine) return;
  await mine.supabase.rpc("consult_close_conversation", { p_conversation_id: id });
  revalidatePath(INBOX);
  revalidatePath(`${INBOX}/${id}`);
}
