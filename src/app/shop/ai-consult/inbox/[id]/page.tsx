import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shop/my-shop";
import { decryptSecret, maskContact } from "@/lib/ai/consult/crypto";
import { CHANNEL_LABEL, DELIVERY_LABEL, INTENT_LABEL, ROLE_LABEL, STATUS_LABEL, customerLabel, kstTime } from "@/lib/channels/inbox";
import type { Extracted } from "@/lib/ai/consult/types";
import { LiveRefresh } from "../live";
import { ReplyPanel } from "../reply-panel";
import { closeConversation } from "../actions";

// 대화 상세(P22-5): 전체 메시지(손님·AI·사장님·안내, 시각), AI 초안, 추출 정보(날짜·인원·종목·레벨), 연락처(가린 값만) + 답장 칸.
export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/shop/ai-consult/inbox" className="flex min-h-11 items-center text-sm text-ink-muted">
        ‹ 인박스
      </Link>
      <LiveRefresh />
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <Detail params={params} />
      </Suspense>
    </div>
  );
}

type Msg = { id: string; role: string; text: string; intent: string | null; confidence: number | null; delivery_status: string; tag: string | null; sent_at: string };
const BUBBLE: Record<string, string> = {
  customer: "self-start bg-[#EEF1F6]",
  ai: "self-end bg-[#E3EBFF]",
  owner: "self-end bg-brand text-white",
  system: "self-center bg-[#F6F7F9] text-ink-muted",
};
const EXTRACTED: [keyof Extracted, string][] = [
  ["date", "날짜"],
  ["time", "시간"],
  ["people", "인원"],
  ["sport", "종목"],
  ["level", "레벨"],
];
const TYPE_LABEL: Record<string, string> = { lesson: "강습", rental: "장비 대여", booking: "예약", complaint: "불만", other: "기타" };

// 연락처는 서버에서 풀어 가린 값만 화면에 보낸다(원문은 브라우저로 가지 않는다)
function maskedContact(enc: string | null): string | null {
  if (!enc) return null;
  try {
    return maskContact(decryptSecret(enc)) || null;
  } catch {
    return "확인 불가";
  }
}

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/shop/new");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, channel, status, display_name, external_user_hash, last_customer_message_at")
    .eq("id", id)
    .eq("shop_id", shop.id)
    .maybeSingle();
  if (!conv) notFound();
  const [{ data: msgs }, { data: inq }] = await Promise.all([
    supabase.from("messages").select("id, role, text, intent, confidence, delivery_status, tag, sent_at").eq("conversation_id", id).order("sent_at").limit(300),
    supabase
      .from("inquiries")
      .select("id, type, status, extracted, ai_draft, contact_enc, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const messages = (msgs ?? []) as Msg[];
  const lastCustomer = [...messages].reverse().find((m) => m.role === "customer");
  const lastAi = [...messages].reverse().find((m) => m.role === "ai" || m.role === "system");
  const extracted = (inq?.extracted ?? {}) as Extracted;
  const contact = maskedContact((inq?.contact_enc as string | null) ?? null);
  const draft = inq?.status === "open" ? ((inq.ai_draft as string | null) ?? "") : "";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{customerLabel(conv)}</h1>
        <span className="rounded-full bg-[#EEF1F6] px-2 py-0.5 text-xs text-ink-muted">{CHANNEL_LABEL[conv.channel] ?? conv.channel}</span>
        <span className="rounded-full bg-[#EEF1F6] px-2 py-0.5 text-xs text-ink-muted">{STATUS_LABEL[conv.status] ?? conv.status}</span>
      </div>

      {inq && (
        <section aria-label="문의 정보" className="flex flex-col gap-2 rounded-[14px] border border-line bg-white p-4 text-sm">
          <p className="font-bold">
            {TYPE_LABEL[inq.type as string] ?? "문의"} · {inq.status === "open" ? "답장 전" : inq.status === "replied" ? "답장함" : inq.status === "closed" ? "닫음" : "강습 등록"}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {EXTRACTED.filter(([k]) => extracted[k] !== undefined && extracted[k] !== "").map(([k, label]) => (
              <div key={k} className="contents">
                <dt className="text-ink-muted">{label}</dt>
                <dd>{k === "people" ? `${extracted[k]}명` : String(extracted[k])}</dd>
              </div>
            ))}
            <div className="contents">
              <dt className="text-ink-muted">연락처</dt>
              <dd>{contact ?? "없음"}</dd>
            </div>
          </dl>
        </section>
      )}

      <section aria-label="대화" className="flex flex-col gap-2">
        {messages.map((m) => (
          <article key={m.id} aria-label={`${ROLE_LABEL[m.role] ?? m.role} 메시지`} className={`flex max-w-[85%] min-w-0 flex-col gap-1 rounded-[14px] px-3 py-2 ${BUBBLE[m.role] ?? ""}`}>
            <p className="text-sm break-words whitespace-pre-wrap">{m.text}</p>
            <p className={`text-[11px] ${m.role === "owner" ? "text-white/80" : "text-ink-muted"}`}>
              {ROLE_LABEL[m.role] ?? m.role} · {kstTime(m.sent_at)}
              {m.role !== "customer" && ` · ${DELIVERY_LABEL[m.delivery_status] ?? m.delivery_status}`}
              {m.tag ? ` · ${m.tag}` : ""}
              {m.role === "ai" && m.intent ? ` · ${INTENT_LABEL[m.intent] ?? m.intent}` : ""}
            </p>
          </article>
        ))}
      </section>

      {conv.status !== "closed" && (
        <ReplyPanel conversationId={conv.id} channel={conv.channel} draft={draft} question={lastCustomer?.text ?? ""} feedbackMessageId={lastAi?.id ?? null} />
      )}
      {conv.status !== "closed" && (
        <form action={closeConversation} className="flex justify-end">
          <input type="hidden" name="conversation_id" value={conv.id} />
          <button className="min-h-11 text-sm text-ink-muted underline">상담 닫기</button>
        </form>
      )}
    </>
  );
}
