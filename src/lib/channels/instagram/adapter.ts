// 인스타그램 DM 어댑터 (P22-4, Instagram 로그인 방식). docs/ai-consult/README.md "채널 흐름 — 인스타"
// - 웹훅 서명: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(앱 시크릿, 원문 바이트). JSON으로 바꾸기 전 바이트로 검증한다.
// - 메시지 창: 손님 마지막 메시지 후 24시간 안에는 자동 답변 가능(RESPONSE). 24시간~7일은 사장님이 인박스에서 승인한 답장만
//   HUMAN_AGENT 태그로(자동 경로는 거부 — 자동화에 쓰면 메타 정책 위반). 7일이 지나면 보낼 수 없다.
// - 글자 수: UTF-8 1000바이트 이하(fitChannel 'instagram').
import { createHmac, timingSafeEqual } from "node:crypto";
import { fitChannel } from "@/lib/ai/consult/rules";
import type { CanSendResult, ChannelAdapter, NormalizedMessage, SendOptions, SendResult, SendTarget } from "../types";
import type { InstagramConfig } from "./config";

export const STANDARD_WINDOW_MS = 24 * 60 * 60 * 1000;
export const HUMAN_AGENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);
const id = (v: unknown) => (isRec(v) ? str(v.id, 100) : null);

// 서명 검증 (길이가 달라도 예외 없이 false, 비교는 상수 시간)
export function verifySignature(raw: Uint8Array, header: string | null | undefined, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const given = header.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/i.test(given)) return false;
  const expected = createHmac("sha256", appSecret).update(raw).digest();
  const actual = Buffer.from(given, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// 문자열 비교도 상수 시간 (verify token)
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// 웹훅 이벤트 종류. text만 상담 엔진으로 보낸다. 나머지는 저장만(스토리·첨부·지원 안 함) 또는 무시(에코·리액션·읽음·기타)
export type InstagramEventKind = "text" | "story_reply" | "story_mention" | "attachment" | "unsupported" | "echo" | "reaction" | "read" | "deleted" | "other";
export const STORE_ONLY: ReadonlySet<InstagramEventKind> = new Set(["story_reply", "story_mention", "attachment", "unsupported"]);

export type InstagramEvent = {
  kind: InstagramEventKind;
  accountId: string | null; // 샵 인스타 계정 id (손님 메시지면 recipient, 에코면 sender)
  senderId: string | null; // 손님 id (에코면 우리 계정)
  mid: string | null;
  text: string; // 저장할 글 (스토리·첨부는 "[스토리 답장]"처럼 표시만. 첨부 주소는 저장하지 않는다)
  timestamp: number | null; // ms
};

function classify(m: Rec): { kind: InstagramEventKind; text: string } {
  const msg = m.message;
  if (!isRec(msg)) {
    if (isRec(m.reaction)) return { kind: "reaction", text: "" };
    if (isRec(m.read)) return { kind: "read", text: "" };
    return { kind: "other", text: "" };
  }
  if (msg.is_echo === true) return { kind: "echo", text: "" };
  if (msg.is_deleted === true) return { kind: "deleted", text: "" };
  const text = typeof msg.text === "string" ? msg.text.slice(0, 4000) : "";
  if (isRec(msg.reply_to) && isRec(msg.reply_to.story)) return { kind: "story_reply", text: `[스토리 답장] ${text}`.trim() };
  const atts = Array.isArray(msg.attachments) ? msg.attachments.filter(isRec) : [];
  if (atts.some((a) => a.type === "story_mention")) return { kind: "story_mention", text: "[스토리 멘션]" };
  if (atts.length) {
    const types = [...new Set(atts.map((a) => (typeof a.type === "string" ? a.type.slice(0, 20) : "file")))].join(",");
    return { kind: "attachment", text: `[첨부: ${types}] ${text}`.trim() };
  }
  if (msg.is_unsupported === true) return { kind: "unsupported", text: "[지원하지 않는 메시지]" };
  if (text.trim()) return { kind: "text", text };
  return { kind: "other", text: "" };
}

// 웹훅 본문 → 이벤트 목록 (object가 instagram이 아니면 빈 목록)
export function parseWebhook(body: unknown): InstagramEvent[] {
  if (!isRec(body) || body.object !== "instagram" || !Array.isArray(body.entry)) return [];
  const out: InstagramEvent[] = [];
  for (const entry of body.entry.slice(0, 50)) {
    if (!isRec(entry) || !Array.isArray(entry.messaging)) continue;
    for (const m of entry.messaging.slice(0, 50)) {
      if (!isRec(m)) continue;
      const { kind, text } = classify(m);
      const sender = id(m.sender);
      const recipient = id(m.recipient);
      const mid = isRec(m.message) ? str(m.message.mid, 1000) : isRec(m.reaction) ? str(m.reaction.mid, 1000) : null;
      out.push({
        kind,
        accountId: kind === "echo" ? sender : (recipient ?? id(entry)),
        senderId: sender,
        mid,
        text,
        timestamp: typeof m.timestamp === "number" && Number.isFinite(m.timestamp) ? m.timestamp : null,
      });
    }
  }
  return out;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type InstagramAdapterOptions = {
  config: Pick<InstagramConfig, "graphBase" | "apiVersion" | "humanAgent">;
  accountId: string; // 샵 인스타 계정 id (shop_channels.external_id)
  accessToken: string; // 복호화한 토큰 (메모리에서만)
  fetchImpl?: FetchLike;
  now?: () => Date;
  timeoutMs?: number;
};

// 메시지 창 판정 (시각은 주입). 자동 경로는 24시간까지만, 사장님 승인(approvedByOwner)이면 7일까지 HUMAN_AGENT.
export function canSendInstagram(target: SendTarget, now: Date, opts: SendOptions & { humanAgent?: boolean } = {}): CanSendResult {
  if (!target.externalUserId) return { ok: false, reason: "no_recipient", message: "보낼 손님을 찾지 못했어요" };
  const last = target.lastCustomerMessageAt;
  if (!last) return { ok: false, reason: "no_customer_message", message: "손님이 먼저 메시지를 보내야 답할 수 있어요" };
  const age = Math.max(0, now.getTime() - last.getTime());
  if (age <= STANDARD_WINDOW_MS) return { ok: true, tag: "RESPONSE" };
  if (age <= HUMAN_AGENT_WINDOW_MS) {
    if (!opts.approvedByOwner) return { ok: false, reason: "window_24h", message: "24시간이 지나 자동 답변은 보낼 수 없어요. 사장님이 확인하고 보내 주세요." };
    if (opts.humanAgent === false) return { ok: false, reason: "human_agent_off", message: "24시간이 지난 대화는 Human Agent 승인 뒤에 보낼 수 있어요. 인스타그램 앱에서 직접 답해 주세요." };
    return { ok: true, tag: "HUMAN_AGENT" };
  }
  return { ok: false, reason: "window_7d", message: "마지막 메시지 후 7일이 지나 인스타그램으로 보낼 수 없어요" };
}

export class InstagramAdapter implements ChannelAdapter<unknown> {
  readonly channel = "instagram" as const;
  constructor(private readonly opts: InstagramAdapterOptions) {}

  // 웹훅 메시지 이벤트 하나 → 정규화 메시지 (상담 엔진으로 보낼 글만. 에코·스토리·첨부·리액션은 null)
  receive(raw: unknown): NormalizedMessage | null {
    if (!isRec(raw)) return null;
    const { kind, text } = classify(raw);
    const sender = id(raw.sender);
    if (kind !== "text" || !sender) return null;
    return {
      channel: "instagram",
      externalUserId: sender,
      text,
      messageId: isRec(raw.message) ? str(raw.message.mid, 1000) : null,
      accountId: id(raw.recipient),
      displayName: null,
      replyUrl: null,
    };
  }

  canSend(target: SendTarget, now: Date, opts: SendOptions = {}): CanSendResult {
    return canSendInstagram(target, now, { ...opts, humanAgent: this.opts.config.humanAgent });
  }

  // Send API (POST graph.instagram.com/<버전>/<계정 id>/messages). 보내기 전에 창을 다시 확인한다. 실패해도 다시 보내지 않는다.
  async send(target: SendTarget, text: string, opts: SendOptions = {}): Promise<SendResult> {
    const can = this.canSend(target, (this.opts.now ?? (() => new Date()))(), opts);
    if (!can.ok) return { ok: false, status: "skipped", reason: can.reason, message: can.message };
    const body: Rec = { recipient: { id: target.externalUserId }, message: { text: fitChannel(text, "instagram") } };
    if (can.tag === "HUMAN_AGENT") Object.assign(body, { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" });
    else body.messaging_type = "RESPONSE";
    const { graphBase, apiVersion } = this.opts.config;
    const url = `${graphBase}/${apiVersion}/${encodeURIComponent(this.opts.accountId)}/messages`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 10_000);
    try {
      const res = await (this.opts.fetchImpl ?? fetch)(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.opts.accessToken}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) return { ok: false, status: "failed", reason: `http_${res.status}`, tag: can.tag };
      return { ok: true, status: "sent", tag: can.tag };
    } catch {
      return { ok: false, status: "failed", reason: "network", tag: can.tag };
    } finally {
      clearTimeout(timer);
    }
  }
}
