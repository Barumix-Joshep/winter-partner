// 카카오톡 채널 챗봇(카카오 i 오픈빌더 스킬) 어댑터 (P22-3).
// - 스킬 요청에는 서명이 없다 → 추측할 수 없는 웹훅 주소 토큰 + 봇 id 대조 + 요청 제한으로 막는다(webhook.ts).
// - 무료 챗봇은 손님이 말을 걸 때만 답할 수 있다: 응답 본문으로 바로 답하거나, 콜백 주소(1회용)로 한 번 보낸다.
import type { CanSendResult, ChannelAdapter, NormalizedMessage, SendOptions, SendResult, SendTarget } from "../types";
import { escalateResponse, operatorResponse, simpleTextResponse, ESCALATE_TEXT, type KakaoSkillResponse } from "./format";

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);

// 스킬 요청 → 정규화 메시지. 손님 id·발화가 없으면 처리하지 않는다(null).
export function parseSkillRequest(raw: unknown): NormalizedMessage | null {
  if (!isRec(raw) || !isRec(raw.userRequest)) return null;
  const ur = raw.userRequest;
  if (typeof ur.utterance !== "string" || !isRec(ur.user)) return null;
  const userId = str(ur.user.id, 200);
  if (!userId) return null;
  return {
    channel: "kakao",
    externalUserId: userId,
    text: ur.utterance.slice(0, 4000),
    // 현재 카카오 문서의 스킬 요청에는 발화 id가 없다. 오면 쓰고, 없으면 웹훅이 손님·시각·발화로 만든다.
    messageId: str(ur.id, 200),
    accountId: isRec(raw.bot) ? str(raw.bot.id, 200) : null,
    displayName: null,
    replyUrl: str(ur.callbackUrl, 2000),
  };
}

// shop_channels.external_id(본사가 등록한 봇 id)와 요청의 봇 id가 같은지. 둘 중 하나라도 비면 거부.
export function botMatches(expected: string | null | undefined, actual: string | null | undefined): boolean {
  const norm = (v: string | null | undefined) => (v ?? "").trim().replace(/!$/, "");
  const e = norm(expected);
  return e.length > 0 && e === norm(actual);
}

// 콜백 주소는 손님 요청 본문에서 오므로, 아무 주소로나 POST하지 않게 카카오 https 주소만 허용한다(확인 필요: 실제 도메인은 시범 P22-8에서).
// E2E의 가짜 콜백 서버(localhost)는 KAKAO_CALLBACK_ALLOW_LOCAL=1일 때만 (운영 환경변수에는 넣지 않는다).
export function callbackUrlAllowed(url: string | null | undefined, opts = { allowLocal: process.env.KAKAO_CALLBACK_ALLOW_LOCAL === "1" }): boolean {
  if (!url) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (opts.allowLocal && u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost")) return true;
  return u.protocol === "https:" && (u.hostname === "kakao.com" || u.hostname.endsWith(".kakao.com"));
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

// 콜백은 한 번만 보낸다(카카오 콜백 주소는 1회용). 실패해도 다시 보내지 않고 false → 호출부가 delivery_status='failed'로 남긴다.
export async function postKakaoCallback(url: string, body: KakaoSkillResponse, fetchImpl: FetchLike = fetch, timeoutMs = 10_000): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) return false;
    const json = (await res.json().catch(() => null)) as { status?: string } | null;
    return json?.status !== "FAIL";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export class KakaoAdapter implements ChannelAdapter<unknown> {
  readonly channel = "kakao" as const;
  constructor(private readonly opts: { fetchImpl?: FetchLike } = {}) {}

  receive(raw: unknown) {
    return parseSkillRequest(raw);
  }

  // 손님이 먼저 말을 건 요청의 콜백 주소로만 보낼 수 있다(무료 챗봇은 먼저 보내기 불가 → 사장님은 채널 1:1 채팅에서 직접)
  canSend(target: SendTarget, _now: Date, _opts?: SendOptions): CanSendResult {
    void _now;
    void _opts;
    return callbackUrlAllowed(target.replyUrl) ? { ok: true } : { ok: false, reason: "kakao_reply_only", message: "카카오 무료 챗봇은 먼저 보낼 수 없어요" };
  }

  async send(target: SendTarget, text: string, opts: SendOptions = {}): Promise<SendResult> {
    if (!target.replyUrl || !callbackUrlAllowed(target.replyUrl)) return { ok: false, status: "skipped", reason: "kakao_reply_only" };
    const body = opts.escalate ? (text === ESCALATE_TEXT ? escalateResponse() : operatorResponse(text)) : simpleTextResponse(text);
    const ok = await postKakaoCallback(target.replyUrl, body, this.opts.fetchImpl);
    return ok ? { ok: true, status: "sent" } : { ok: false, status: "failed", reason: "callback_failed" };
  }
}
