// 인스타그램 웹훅 흐름 (P22-4, docs/ai-consult/README.md "채널 흐름 — 인스타"). DB·AI·시간·HTTP는 모두 deps로 받는다(테스트에서 바꿔 끼움).
// GET: hub.mode=subscribe 이고 hub.verify_token이 META_VERIFY_TOKEN과 같으면 hub.challenge를 그대로(글자) 돌려준다. 아니면 403.
// POST: 원문 바이트로 서명 검증(실패 400) → 200을 바로 돌려주고, 처리는 after()에서.
// 처리: 수신 계정 id로 샵 채널 찾기 → 손님 id 해시 → mid로 중복 제거하며 저장 → 요청 제한 → 엔진 → 24시간 창 확인 → Send API → 답변 기록(태그·발송 결과).
// 에코(우리가 보낸 것)·리액션·읽음은 무시, 스토리 답장·스토리 멘션·첨부·지원 안 함은 저장만(자동 답변 없음).
// 손님 글 속 전화·이메일은 서버 규칙으로 뽑아(P22-6) 문의에 넘기고(저장하는 쪽이 암호화), 메시지에는 가린 글만 저장한다.
// 연락처를 남긴 손님은 사장님이 연락해야 하므로 자동 답변을 했더라도 문의를 연다.
// 대화 요청 제한을 넘으면 AI 없이 escalate(열린 문의가 없을 때만 "사장님께 전달했어요" 한 번 + 문의).
// AI 상담 사용권이 없거나 이번 달 포함 응답을 다 쓴 샵(P23-2)도 같은 자리에서 AI 없이 escalate.
// 환경변수가 없으면 기능 꺼짐(404). 로그에는 손님 글·손님 id·연락처를 쓰지 않는다(종류·길이·결과만).
import { extractContact } from "@/lib/ai/consult/contact";
import { hashExternalId } from "@/lib/ai/consult/crypto";
import { ESCALATE_REPLY } from "@/lib/ai/consult/engine";
import { CONSULT_PROMPT_VERSION } from "@/lib/ai/consult/prompt";
import { fitChannel } from "@/lib/ai/consult/rules";
import type { ConsultInput, ConsultResult, LicenseState } from "@/lib/ai/consult/types";
import type { LimitName } from "@/lib/ops/limits";
import type { InquiryType, ReplyContext, ReplyRecord } from "../store";
import type { ChannelAdapter } from "../types";
import { STORE_ONLY, parseWebhook, safeEqual, verifySignature, type InstagramEvent } from "./adapter";
import type { InstagramConfig } from "./config";

export const MAX_BODY_BYTES = 256 * 1024;

export type InstagramChannelRow = { id: string; shop_id: string; channel: string; external_id: string | null; enabled: boolean; credentials_enc: string | null };

export type InstagramWebhookDeps = {
  config: () => InstagramConfig | null;
  hashKey: () => string | null;
  findChannelByAccount: (accountId: string) => Promise<InstagramChannelRow | null>;
  recordCustomerMessage: (m: { channelId: string; userHash: string; messageId: string; text: string }) => Promise<{ conversationId: string; duplicate: boolean } | null>;
  rateOk: (name: LimitName, subject: string) => Promise<boolean>;
  // AI 상담 사용권 (P23-2, DB consult_license_check). 없으면 확인하지 않는다(지금 동작). 실패하면 ok로 보고 DB 게이트가 다시 막는다
  licenseState?: (shopId: string) => Promise<LicenseState>;
  runConsult: (input: ConsultInput) => Promise<ConsultResult>;
  replyContext: (shopId: string, conversationId: string) => Promise<ReplyContext>;
  recordReply: (r: ReplyRecord) => Promise<void>;
  hasOpenInquiry: (conversationId: string) => Promise<boolean>;
  // contact: 손님 글에서 뽑은 연락처 원문(없으면 null) — 저장하는 쪽이 암호화한다(inquiries.contact_enc)
  openInquiry: (i: { conversationId: string; type: InquiryType; extracted: ConsultResult["extracted"]; draft: string | undefined; contact: string | null }) => Promise<void>;
  markDisclosed: (conversationId: string) => Promise<void>;
  // 사장님 승인 발송(P22-5, 인박스)에 쓸 손님 인스타 id를 대화에 남긴다(저장하는 쪽이 암호화 — 원문은 DB·로그에 남지 않는다)
  saveReplyTarget: (conversationId: string, senderId: string) => Promise<void>;
  // 채널 토큰을 풀어 보낼 어댑터를 만든다(토큰이 없거나 못 풀면 null)
  sender: (ch: InstagramChannelRow) => Pick<ChannelAdapter, "send"> | null;
  defer: (task: () => Promise<void>) => void; // 라우트에서는 next/server의 after
  now: () => number;
  log: (e: Record<string, unknown>) => void;
};

const FALLBACK: ConsultResult = { mode: "escalate", reply: "", confidence: 0, intent: "unknown", promptVersion: CONSULT_PROMPT_VERSION, reason: "ai_unavailable" };
const RATE_LIMITED: ConsultResult = { ...FALLBACK, reason: "rate_limited" };
const NO_DISCLOSE: ReplyContext = { disclosureText: "", discloseFirst: false, disclosedAt: null };

function inquiryType(intent: string): InquiryType {
  if (intent === "booking") return "booking";
  if (intent === "complaint") return "complaint";
  return "other";
}

// GET 구독 확인
export function instagramVerify(url: URL, cfg: InstagramConfig | null): Response {
  if (!cfg) return new Response("not found", { status: 404 });
  const p = url.searchParams;
  const challenge = p.get("hub.challenge") ?? "";
  const token = p.get("hub.verify_token") ?? "";
  if (p.get("hub.mode") === "subscribe" && token && safeEqual(token, cfg.verifyToken) && /^[A-Za-z0-9_-]{1,200}$/.test(challenge)) {
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return new Response("forbidden", { status: 403 });
}

// POST 본체: 서명 검증 뒤 바로 200, 처리는 defer
export async function instagramRoute(req: Request, deps: InstagramWebhookDeps): Promise<Response> {
  const cfg = deps.config();
  if (!cfg) return new Response("not found", { status: 404 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return new Response("too large", { status: 400 });
  let raw: Uint8Array;
  try {
    raw = new Uint8Array(await req.arrayBuffer());
  } catch {
    return new Response("bad request", { status: 400 });
  }
  if (raw.byteLength > MAX_BODY_BYTES) return new Response("too large", { status: 400 });
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"), cfg.appSecret)) {
    deps.log({ channel: "instagram", outcome: "bad_signature", bytes: raw.byteLength });
    return new Response("bad signature", { status: 400 });
  }
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const events = parseWebhook(body);
  if (events.length) {
    deps.defer(async () => {
      for (const e of events) {
        try {
          await handleInstagramEvent(e, deps);
        } catch (err) {
          deps.log({ channel: "instagram", outcome: "error", kind: e.kind, error: (err as Error)?.name ?? "error" });
        }
      }
    });
  }
  return new Response("EVENT_RECEIVED", { status: 200 });
}

// 이벤트 하나 처리 (after() 안에서 차례로)
export async function handleInstagramEvent(e: InstagramEvent, deps: InstagramWebhookDeps): Promise<void> {
  const start = deps.now();
  const len = e.text.length;
  const log = (outcome: string, extra: Record<string, unknown> = {}) => deps.log({ channel: "instagram", outcome, kind: e.kind, len, ms: deps.now() - start, ...extra });

  if (e.kind === "echo" || e.kind === "reaction" || e.kind === "read" || e.kind === "deleted" || e.kind === "other") return log("ignored");
  if (!e.accountId || !e.senderId || !e.mid) return log("bad_event");
  const key = deps.hashKey();
  if (!key) return log("no_hash_key");
  const ch = await deps.findChannelByAccount(e.accountId).catch(() => null);
  if (!ch || !ch.enabled || ch.channel !== "instagram") return log("channel_off");

  // 사용권 확인은 지금 시작해 요청 제한·저장과 함께 돈다
  const licenseP: Promise<LicenseState> = deps.licenseState ? deps.licenseState(ch.shop_id).catch((): LicenseState => "ok") : Promise.resolve("ok");

  // 샵 요청 제한 (넘으면 저장도 하지 않는다 — 도배 방지)
  if (!(await deps.rateOk("consult_shop", ch.shop_id))) return log("rate_shop");

  // 저장·중복 제거 (메타는 실패하면 36시간 동안 다시 보낸다 → mid 한 번만)
  const userHash = hashExternalId("instagram", e.senderId, key);
  const messageId = e.mid.length <= 200 ? e.mid : hashExternalId("instagram-mid", e.mid, key);
  const { contact, masked } = extractContact(e.text);
  const rec = await deps.recordCustomerMessage({ channelId: ch.id, userHash, messageId, text: masked }).catch(() => null);
  if (!rec) return log("record_failed");
  if (rec.duplicate) return log("duplicate");
  const conversationId = rec.conversationId;
  await deps.saveReplyTarget(conversationId, e.senderId).catch(() => log("reply_target_failed"));
  if (STORE_ONLY.has(e.kind)) {
    if (contact) await deps.openInquiry({ conversationId, type: "other", extracted: undefined, draft: undefined, contact });
    return log("stored_only");
  }

  // 사용권 없음·이번 달 소진이면 AI를 부르지 않고 escalate (대화 요청 제한과 같은 자리)
  const license = await licenseP;
  if (license !== "ok") log(license === "monthly_quota" ? "monthly_quota" : "license_off");
  // 대화 요청 제한 (넘으면 AI를 부르지 않고 escalate — 메시지는 저장됨, 안내는 열린 문의가 없을 때 한 번만)
  const limited = license === "ok" && !(await deps.rateOk("consult_conversation", conversationId));
  if (limited) log("rate_conversation");

  const [r, ctx] = await Promise.all([
    license !== "ok" ? { ...FALLBACK, reason: license } : limited ? RATE_LIMITED : deps.runConsult({ shopId: ch.shop_id, conversationId, text: e.text, channel: "instagram" }).catch(() => FALLBACK),
    deps.replyContext(ch.shop_id, conversationId).catch(() => NO_DISCLOSE),
  ]);

  // 보낼 글: 자동 답변(첫 답변이면 고지 문구) 또는 사장님께 전달 안내(대화에 열린 문의가 없을 때 한 번만)
  let text: string | null;
  let role: "ai" | "system";
  let disclose = false;
  if (r.mode === "auto") {
    disclose = ctx.discloseFirst && !ctx.disclosedAt && ctx.disclosureText.trim().length > 0;
    text = fitChannel(disclose ? `${ctx.disclosureText.trim()}\n\n${r.reply}` : r.reply, "instagram");
    role = "ai";
  } else {
    text = (await deps.hasOpenInquiry(conversationId).catch(() => false)) ? null : ESCALATE_REPLY;
    role = "system";
  }

  if (text) {
    const adapter = deps.sender(ch);
    const target = { externalUserId: e.senderId, lastCustomerMessageAt: new Date(e.timestamp ?? deps.now()) };
    // 자동 경로: 사장님 승인 없음 → 24시간이 지나면 어댑터가 거부(skipped)
    const sent = adapter ? await adapter.send(target, text, { approvedByOwner: false, escalate: r.mode === "escalate" }) : { ok: false, status: "failed" as const, reason: "no_token" };
    await deps.recordReply({
      conversationId,
      role,
      text,
      intent: r.intent,
      confidence: r.confidence,
      promptVersion: r.promptVersion,
      delivery: sent.status,
      tag: "tag" in sent ? (sent.tag ?? null) : null,
    });
    log("reply", { mode: r.mode, intent: r.intent, reason: r.reason, delivery: sent.status, why: sent.reason });
    if (disclose && sent.status === "sent") await deps.markDisclosed(conversationId);
  } else {
    log("escalate_quiet", { mode: r.mode, intent: r.intent, reason: r.reason });
  }
  if (r.mode === "escalate" || contact) await deps.openInquiry({ conversationId, type: inquiryType(r.intent), extracted: r.extracted, draft: r.draft, contact });
}
