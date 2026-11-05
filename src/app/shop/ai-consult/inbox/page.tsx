import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shop/my-shop";
import {
  CHANNEL_LABEL,
  DELIVERY_LABEL,
  INTENT_LABEL,
  STATUS_LABEL,
  customerLabel,
  displayText,
  kstDayRange,
  kstTime,
  kstToday,
  sortConversations,
} from "@/lib/channels/inbox";
import { LiveRefresh } from "./live";
import { WrongButton } from "./reply-panel";

// AI 상담 인박스(P22-5): 사장님이 처리할 문의(사장님 대기 먼저) + 자동응답 기록. 화면이 보이는 동안 10초마다 새 메시지를 확인한다(live.tsx).
type Search = { tab?: string; day?: string };

export default function InboxPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">AI 상담 인박스</h1>
        <p className="mt-1 text-sm text-ink-muted">
          카카오톡·인스타그램 문의 중 AI가 답하지 않고 넘긴 것이 위에 옵니다. 답장 초안을 고쳐 보내거나 복사해 쓰세요.
        </p>
      </div>
      <LiveRefresh />
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <Content searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function Tabs({ tab }: { tab: "inbox" | "log" }) {
  const cls = (on: boolean) => `flex min-h-11 flex-1 items-center justify-center rounded-lg text-sm font-medium ${on ? "bg-brand text-white" : "bg-[#EEF1F6] text-ink-muted"}`;
  return (
    <nav aria-label="인박스 보기" className="flex gap-2">
      <Link href="/shop/ai-consult/inbox" aria-current={tab === "inbox" ? "page" : undefined} className={cls(tab === "inbox")}>
        문의
      </Link>
      <Link href="/shop/ai-consult/inbox?tab=log" aria-current={tab === "log" ? "page" : undefined} className={cls(tab === "log")}>
        자동응답 기록
      </Link>
    </nav>
  );
}

async function Content({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/shop/new");
  const { tab, day } = await searchParams;
  if (tab === "log") return <AutoReplyLog shopId={shop.id} day={kstDayRange(day) ? day! : kstToday()} />;
  return <Conversations shopId={shop.id} />;
}

async function Conversations({ shopId }: { shopId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversations")
    .select("id, channel, status, display_name, external_user_hash, last_customer_message_at")
    .eq("shop_id", shopId)
    .neq("status", "closed")
    .order("last_customer_message_at", { ascending: false, nullsFirst: false })
    .limit(50);
  const convs = sortConversations((data ?? []) as { id: string; channel: string; status: string; display_name: string | null; external_user_hash: string; last_customer_message_at: string | null }[]);
  const ids = convs.map((c) => c.id);
  const [{ data: msgs }, { data: inqs }] = ids.length
    ? await Promise.all([
        supabase.from("messages").select("conversation_id, text").in("conversation_id", ids).eq("role", "customer").order("sent_at", { ascending: false }).limit(200),
        supabase.from("inquiries").select("conversation_id, type, status").in("conversation_id", ids).eq("status", "open"),
      ])
    : [{ data: [] }, { data: [] }];
  const preview = new Map<string, string>();
  for (const m of msgs ?? []) if (!preview.has(m.conversation_id as string)) preview.set(m.conversation_id as string, displayText("customer", m.text as string));
  const open = new Set((inqs ?? []).map((i) => i.conversation_id as string));
  const waiting = convs.filter((c) => c.status === "waiting_owner").length;

  return (
    <>
      <Tabs tab="inbox" />
      <p role="status" className="text-sm font-medium">
        사장님 대기 {waiting}건
      </p>
      {!convs.length && <p className="rounded-[14px] border border-line bg-white p-4 text-sm text-ink-muted">아직 받은 상담이 없습니다.</p>}
      <ul aria-label="상담 목록" className="flex flex-col gap-2">
        {convs.map((c) => (
          <li key={c.id}>
            <Link
              href={`/shop/ai-consult/inbox/${c.id}`}
              className={`flex min-w-0 flex-col gap-1 rounded-[14px] border bg-white p-4 ${c.status === "waiting_owner" ? "border-brand" : "border-line"}`}
            >
              <span className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-[#EEF1F6] px-2 py-0.5 text-ink-muted">{CHANNEL_LABEL[c.channel] ?? c.channel}</span>
                <span className={`rounded-full px-2 py-0.5 ${c.status === "waiting_owner" ? "bg-[#FFF1E0] text-[#7A3E06]" : "bg-[#E6F4EA] text-[#1B6B3A]"}`}>
                  {STATUS_LABEL[c.status] ?? c.status}
                </span>
                {open.has(c.id) && <span className="text-[#7A3E06]">문의 열림</span>}
                <span className="ml-auto text-ink-muted">{c.last_customer_message_at ? kstTime(c.last_customer_message_at) : ""}</span>
              </span>
              <span className="text-sm font-bold">{customerLabel(c)}</span>
              <span className="truncate text-sm text-ink-muted">{preview.get(c.id) ?? ""}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

async function AutoReplyLog({ shopId, day }: { shopId: string; day: string }) {
  const range = kstDayRange(day)!;
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("id, conversation_id, channel, text, intent, confidence, delivery_status, tag, sent_at")
    .eq("shop_id", shopId)
    .eq("role", "ai")
    .gte("sent_at", range.from)
    .lt("sent_at", range.to)
    .order("sent_at", { ascending: false })
    .limit(200);
  const rows = data ?? [];
  const { data: fb } = rows.length ? await supabase.from("ai_feedback").select("message_id").in("message_id", rows.map((r) => r.id as string)) : { data: [] };
  const flagged = new Set((fb ?? []).map((f) => f.message_id as string));
  return (
    <>
      <Tabs tab="log" />
      <form className="flex flex-wrap items-end gap-2" aria-label="날짜로 보기">
        <input type="hidden" name="tab" value="log" />
        <label className="text-sm font-medium">
          날짜
          <input type="date" name="day" defaultValue={day} className="mt-1 block min-h-11 rounded-[10px] border border-line bg-white px-3 text-base" />
        </label>
        <button className="min-h-11 rounded-[10px] border border-line bg-white px-4 text-sm font-medium">보기</button>
      </form>
      <p role="status" className="text-sm font-medium">
        {day} 자동응답 {rows.length}건
      </p>
      <ul aria-label="자동응답 목록" className="flex flex-col gap-2">
        {rows.map((m) => (
          <li key={m.id as string} className="flex min-w-0 flex-col gap-2 rounded-[14px] border border-line bg-white p-4">
            <span className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              <span>{kstTime(m.sent_at as string)}</span>
              <span>{CHANNEL_LABEL[m.channel as string] ?? m.channel}</span>
              <span>의도: {INTENT_LABEL[m.intent as string] ?? m.intent ?? "-"}</span>
              <span>신뢰도 {m.confidence == null ? "-" : `${Math.round(Number(m.confidence) * 100)}%`}</span>
              <span className={m.delivery_status === "failed" ? "text-danger" : ""}>
                {DELIVERY_LABEL[m.delivery_status as string] ?? m.delivery_status}
                {m.tag ? ` · ${m.tag}` : ""}
              </span>
            </span>
            <p className="text-sm break-words whitespace-pre-wrap">{displayText("ai", m.text as string)}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href={`/shop/ai-consult/inbox/${m.conversation_id}`} className="flex min-h-11 items-center text-sm text-brand underline">
                대화 보기
              </Link>
              {flagged.has(m.id as string) ? <span className="text-sm text-ink-muted">틀림으로 기록됨</span> : <WrongButton messageId={m.id as string} draft={m.text as string} />}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
