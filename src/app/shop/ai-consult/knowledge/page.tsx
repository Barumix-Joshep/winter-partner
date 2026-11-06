import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shop/my-shop";
import { KB_ACTIVE_TOTAL_MAX, KB_KIND_LABEL, KB_KINDS, type KbItem } from "@/lib/ai/consult/knowledge";
import { AddKnowledgeForm, DisclosureForm, KnowledgeItemForm } from "./forms";
import { instagramConfig } from "@/lib/channels/instagram/config";
import { disconnectInstagram, setAutoReply } from "./actions";
import type { LicenseView } from "@/lib/ai/consult/license";
import { myConsultLicenseView } from "@/lib/ai/consult/license-server";

// AI 상담(P22) 안내 정보: AI는 여기서 "AI 답변에 사용"으로 켠 사실(가격·영업시간·위치·정책)만 손님에게 바로 답한다.
// 예약 확정·금액 협상·불만·여기 없는 질문은 항상 사장님께 넘긴다(초안만). CLAUDE.md AI 원칙의 예외.
export default function KnowledgePage({ searchParams }: { searchParams: Promise<{ ig?: string }> }) {
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
        <Content searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Content({ searchParams }: { searchParams: Promise<{ ig?: string }> }) {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/shop/new");
  const supabase = await createClient();
  const [{ data: items }, { data: settings }, { data: channels }, lic] = await Promise.all([
    supabase.from("shop_knowledge").select("id, kind, title, content, is_active").eq("shop_id", shop.id).order("sort").order("created_at"),
    supabase.from("shop_consult_settings").select("auto_reply_enabled, ai_disclosure_text, disclose_first_reply").eq("shop_id", shop.id).maybeSingle(),
    supabase.from("shop_channels").select("channel, enabled, external_id, token_expires_at").eq("shop_id", shop.id),
    myConsultLicenseView(shop.id),
  ]);
  // AI 상담 사용권(P23-2). 켜짐 스위치가 꺼져 있으면 show=false → 지금 화면 그대로
  const blocked = !!lic?.show && !lic.canTurnOn;
  const { ig } = await searchParams;
  const instagram = (channels ?? []).find((c) => c.channel === "instagram") ?? null;
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
              {connected.length ? connected.join(", ") : "아직 없음"}
            </p>
          </div>
          {/* 사용권이 없으면 켜기 대신 안내(DB도 거부한다). 끄기는 언제나 된다 */}
          {on || !blocked ? (
            <form action={setAutoReply}>
              <input type="hidden" name="enabled" value={on ? "false" : "true"} />
              <button
                aria-label={`AI 자동 응대 ${on ? "끄기" : "켜기"}`}
                className={`min-h-11 rounded-lg px-4 text-sm font-medium ${on ? "bg-[#E6F4EA] text-[#1B6B3A]" : "bg-[#EEF1F6] text-ink-muted"}`}
              >
                {on ? "켜짐" : "꺼짐"}
              </button>
            </form>
          ) : (
            <span className="min-h-11 rounded-lg bg-[#EEF1F6] px-4 py-3 text-sm font-medium text-ink-muted">사용권 필요</span>
          )}
        </div>
        {lic?.show && <LicenseBox view={lic} />}
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

      <InstagramSection ready={!!instagramConfig()} channel={instagram} notice={ig} blocked={blocked} />

      {blocked && <p className="text-sm text-ink-muted">사용권이 생기면 AI가 아래 안내 정보로 손님께 답합니다. 지금 미리 채워 두세요.</p>}
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

const IG_NOTICE: Record<string, { text: string; ok: boolean }> = {
  connected: { text: "인스타그램을 연결했습니다. 손님 DM이 오면 AI가 안내 정보로 답합니다(AI 자동 응대가 켜져 있을 때).", ok: true },
  denied: { text: "인스타그램 연결을 취소했습니다.", ok: false },
  expired: { text: "연결 시간이 지났습니다. 다시 눌러 주세요.", ok: false },
  taken: { text: "이 인스타그램 계정은 이미 다른 샵에 연결되어 있습니다. 본사에 문의해 주세요.", ok: false },
  no_license: { text: "AI 상담 사용권이 있어야 인스타그램을 연결할 수 있습니다. 본사에 요청해 주세요.", ok: false },
  error: { text: "인스타그램 연결에 실패했습니다. 잠시 뒤 다시 시도해 주세요.", ok: false },
};

// AI 상담 사용권 (P23-2): 체험·이용 기간, 이번 달 응답 / 한도, 막혔을 때 안내. 가격은 보이지 않는다(Q17)
function LicenseBox({ view }: { view: LicenseView }) {
  const bar = view.level === "full" ? "bg-danger" : view.level === "warn" ? "bg-[#D97706]" : "bg-brand";
  return (
    <div aria-label="AI 상담 사용권" role="group" className="flex flex-col gap-2 rounded-lg bg-[#F5F7FB] p-3 text-sm">
      {!view.canTurnOn && <p className="font-bold">AI 상담 사용권이 필요해요</p>}
      {view.period && <p className="font-medium">{view.period}</p>}
      {view.usage && (
        <>
          <p className={view.level === "ok" ? "text-ink-muted" : "font-medium text-[#7A3E06]"}>{view.usage}</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#E3E8F1]" aria-hidden>
            <div className={`h-full ${bar}`} style={{ width: `${view.percent}%` }} />
          </div>
        </>
      )}
      {view.notice && (
        <p role="status" className="rounded-lg bg-[#FFF1E0] p-3 text-[#7A3E06]">
          {view.notice}
        </p>
      )}
    </div>
  );
}

// 요청 때 서버에서 한 번 판단한다(토큰 만료 = 다시 연결 필요)
const isPast = (iso: string | null) => !!iso && Date.parse(iso) <= Date.now();

// 인스타그램 DM 연결 (P22-4, Instagram 로그인). 메타 환경변수가 없으면 "준비 중"만 보인다.
function InstagramSection({
  ready,
  channel,
  notice,
  blocked,
}: {
  ready: boolean;
  channel: { enabled: boolean; external_id: string | null; token_expires_at: string | null } | null;
  notice: string | undefined;
  blocked: boolean; // AI 상담 사용권 없음(P23-2): 새 연결 버튼을 숨긴다. 이미 연결된 채널은 그대로(문의는 사장님께)
}) {
  const msg = notice ? IG_NOTICE[notice] : undefined;
  const connected = !!channel?.enabled && !!channel.external_id;
  const expired = connected && isPast(channel.token_expires_at);
  const until = channel?.token_expires_at ? new Date(channel.token_expires_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) : null;
  return (
    <section aria-label="인스타그램 연결" className="flex flex-col gap-3 rounded-[14px] border border-line bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">인스타그램 DM</p>
          <p className="text-xs text-ink-muted">
            {!ready
              ? "준비 중 — 본사가 메타 앱 심사를 마치면 여기서 연결할 수 있습니다."
              : expired
                ? "연결이 만료되었습니다. 다시 연결해 주세요."
                : connected
                  ? `연결됨${until ? ` · ${until}까지 자동 갱신` : ""}. 손님 마지막 메시지 후 24시간이 지나면 자동 답변을 보내지 않습니다.`
                  : blocked
                    ? "AI 상담 사용권이 있어야 연결할 수 있습니다. 본사에 요청해 주세요."
                    : "인스타그램 비즈니스(프로페셔널) 계정으로 로그인해 연결합니다. 페이스북 페이지는 필요 없습니다."}
          </p>
        </div>
        {ready && !blocked && (!connected || expired) && (
          <a href="/api/channels/instagram/connect" className="inline-flex min-h-11 items-center rounded-lg bg-[#1E4FD8] px-4 text-sm font-medium text-white">
            인스타그램 연결하기
          </a>
        )}
        {ready && connected && (
          <form action={disconnectInstagram}>
            <button className="min-h-11 rounded-lg bg-[#EEF1F6] px-4 text-sm font-medium text-ink-muted">연결 해제</button>
          </form>
        )}
      </div>
      {msg && (
        <p role="status" className={`rounded-lg p-3 text-sm ${msg.ok ? "bg-[#E6F4EA] text-[#1B6B3A]" : "bg-[#FFF1E0] text-[#7A3E06]"}`}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
