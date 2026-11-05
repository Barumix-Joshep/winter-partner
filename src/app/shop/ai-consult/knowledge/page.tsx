import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shop/my-shop";
import { KB_ACTIVE_TOTAL_MAX, KB_KIND_LABEL, KB_KINDS, type KbItem } from "@/lib/ai/consult/knowledge";
import { AddKnowledgeForm, DisclosureForm, KnowledgeItemForm } from "./forms";
import { setAutoReply } from "./actions";

// AI 상담(P22) 안내 정보: AI는 여기서 "AI 답변에 사용"으로 켠 사실(가격·영업시간·위치·정책)만 손님에게 바로 답한다.
// 예약 확정·금액 협상·불만·여기 없는 질문은 항상 사장님께 넘긴다(초안만). CLAUDE.md AI 원칙의 예외.
export default function KnowledgePage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">AI 상담 안내 정보</h1>
        <p className="mt-1 text-sm text-ink-muted">
          카카오톡·인스타그램 상담에서 AI는 아래에 적고 &lsquo;AI 답변에 사용&rsquo;으로 켠 내용만 손님께 바로 답합니다. 예약 확정·금액 협상·불만이나 여기
          없는 질문은 답하지 않고 사장님께 넘깁니다(답장 초안만 만들어 드립니다).
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/shop/new");
  const supabase = await createClient();
  const [{ data: items }, { data: settings }, { data: channels }] = await Promise.all([
    supabase.from("shop_knowledge").select("id, kind, title, content, is_active").eq("shop_id", shop.id).order("sort").order("created_at"),
    supabase.from("shop_consult_settings").select("auto_reply_enabled, ai_disclosure_text, disclose_first_reply").eq("shop_id", shop.id).maybeSingle(),
    supabase.from("shop_channels").select("channel, enabled").eq("shop_id", shop.id),
  ]);
  const kb = (items ?? []) as KbItem[];
  const on = !!settings?.auto_reply_enabled;
  const active = kb.filter((i) => i.is_active);
  const used = active.reduce((n, i) => n + i.content.length, 0);
  const connected = (channels ?? []).filter((c) => c.enabled).map((c) => (c.channel === "instagram" ? "인스타그램" : "카카오톡"));

  return (
    <>
      <section aria-label="AI 응대" className="flex flex-col gap-4 rounded-[14px] border border-line bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">AI 자동 응대</p>
            <p className="text-xs text-ink-muted">
              {on ? "켜짐 — 안내 정보 범위의 질문은 AI가 바로 답합니다." : "꺼짐 — 모든 문의를 사장님께 넘깁니다."} 연결된 채널:{" "}
              {connected.length ? connected.join(", ") : "아직 없음(카카오·인스타 연결은 준비 중)"}
            </p>
          </div>
          <form action={setAutoReply}>
            <input type="hidden" name="enabled" value={on ? "false" : "true"} />
            <button
              aria-label={`AI 자동 응대 ${on ? "끄기" : "켜기"}`}
              className={`min-h-11 rounded-lg px-4 text-sm font-medium ${on ? "bg-[#E6F4EA] text-[#1B6B3A]" : "bg-[#EEF1F6] text-ink-muted"}`}
            >
              {on ? "켜짐" : "꺼짐"}
            </button>
          </form>
        </div>
        {on && !active.length && (
          <p role="status" className="rounded-lg bg-[#FFF1E0] p-3 text-sm text-[#7A3E06]">
            &lsquo;AI 답변에 사용&rsquo;으로 켠 안내 정보가 없어 지금은 모든 문의가 사장님께 넘어갑니다.
          </p>
        )}
        <DisclosureForm text={settings?.ai_disclosure_text ?? ""} discloseFirst={settings?.disclose_first_reply ?? true} />
        <p className="text-xs text-ink-muted">
          손님이 보낸 글은 답변을 만들기 위해 AI 서비스(Anthropic)로 전송됩니다. 글 속 전화번호·이메일은 가린 뒤 보냅니다.{" "}
          <span className="font-medium">(초안 — 법률 검토 전)</span>
        </p>
      </section>

      <p className="text-xs text-ink-muted">
        사용 중 {active.length}개 · {used.toLocaleString()} / {KB_ACTIVE_TOTAL_MAX.toLocaleString()}자. 예시 문구(00원)는 실제 내용으로 바꾼 뒤 켜 주세요.
      </p>
      {KB_KINDS.filter((k) => kb.some((i) => i.kind === k)).map((k) => (
        <section key={k} aria-label={KB_KIND_LABEL[k]} className="flex flex-col gap-2">
          <h2 className="text-base font-bold">{KB_KIND_LABEL[k]}</h2>
          <ul className="flex flex-col gap-2">
            {kb
              .filter((i) => i.kind === k)
              .map((i) => (
                <KnowledgeItemForm key={i.id} item={i} />
              ))}
          </ul>
        </section>
      ))}
      <AddKnowledgeForm />
    </>
  );
}
