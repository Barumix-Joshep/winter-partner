// 카카오 스킬 웹훅 흐름 (P22-3, docs/ai-consult/README.md "채널 흐름 — 카카오"). DB·AI·시간·HTTP는 모두 deps로 받는다(테스트에서 바꿔 끼움).
// 1. 토큰으로 채널 찾기 → 꺼짐·없음·봇 id 불일치·해시 키 없음이면 기본 안내(HTTP 200, 카카오는 올바른 스킬 JSON을 기대한다)
// 2. 손님 id 해시 → 손님 메시지 저장(발화 id로 중복 제거, 중복이면 엔진을 다시 돌리지 않는다)
// 3. 샵·대화 요청 제한 → 넘으면 AI 없이 상담 연결 안내. AI 상담 사용권이 없거나 이번 달 포함 응답을 다 썼으면(P23-2) AI 없이 상담 연결 + 문의
// 4. 엔진이 요청을 받은 때부터 약 3.5초 안에 끝나면 바로 답하고, 넘기면 useCallback으로 답한 뒤 after()에서 callbackUrl로 한 번만 보낸다
// 5. escalate면 상담 연결 버튼 + 문의 열기. 첫 자동 답변에는 샵 고지 문구를 붙인다.
// 6. 손님 글 속 전화·이메일은 서버 규칙으로 뽑아(P22-6) 문의에 넘기고(저장하는 쪽이 암호화), 메시지에는 가린 글만 저장한다.
//    연락처를 남긴 손님은 사장님이 연락해야 하므로 자동 답변을 했더라도 문의를 연다.
// 로그에는 손님 글·손님 id·연락처를 쓰지 않는다(길이·의도·경로만).
import { extractContact } from "@/lib/ai/consult/contact";
import { hashExternalId } from "@/lib/ai/consult/crypto";
import { CONSULT_PROMPT_VERSION } from "@/lib/ai/consult/prompt";
import type { ConsultInput, ConsultIntent, ConsultResult, Extracted, LicenseState } from "@/lib/ai/consult/types";
import type { LimitName } from "@/lib/ops/limits";
import type { DeliveryStatus } from "../types";
import { botMatches, callbackUrlAllowed, parseSkillRequest } from "./adapter";
import {
  ESCALATE_TEXT,
  busyResponse,
  callbackAck,
  duplicateResponse,
  escalateResponse,
  guidanceResponse,
  simpleTextResponse,
  type KakaoSkillResponse,
} from "./format";

export const KAKAO_BUDGET_MS = 3_500; // 카카오 5초 제한에서 네트워크 여유를 뺀 값
export const MAX_BODY_BYTES = 64 * 1024;
const UTTERANCE_BUCKET_MS = 30_000; // 발화 id가 없을 때 같은 손님·같은 글을 한 번으로 보는 구간
const TOKEN_RE = /^[0-9a-f]{48}$/;

export type KakaoChannelRow = { id: string; shop_id: string; channel: string; external_id: string | null; enabled: boolean };
export type ReplyContext = { disclosureText: string; discloseFirst: boolean; disclosedAt: string | null };
export type InquiryType = "lesson" | "rental" | "booking" | "complaint" | "other";

export type KakaoWebhookDeps = {
  hashKey: () => string | null;
  findChannel: (token: string) => Promise<KakaoChannelRow | null>;
  recordCustomerMessage: (m: { channelId: string; userHash: string; messageId: string; text: string }) => Promise<{ conversationId: string; duplicate: boolean } | null>;
  rateOk: (name: LimitName, subject: string) => Promise<boolean>;
  // AI 상담 사용권 (P23-2, DB consult_license_check 쿼리 1개). 없으면 확인하지 않는다(지금 동작). 실패하면 ok로 보고 DB 게이트가 다시 막는다
  licenseState?: (shopId: string) => Promise<LicenseState>;
  runConsult: (input: ConsultInput) => Promise<ConsultResult>;
  replyContext: (shopId: string, conversationId: string) => Promise<ReplyContext>;
  recordReply: (r: {
    conversationId: string;
    role: "ai" | "system";
    text: string;
    intent: string;
    confidence: number;
    promptVersion: string;
    delivery: DeliveryStatus;
  }) => Promise<void>;
  // contact: 손님 글에서 뽑은 연락처 원문(없으면 null) — 저장하는 쪽이 암호화한다(inquiries.contact_enc)
  openInquiry: (i: { conversationId: string; type: InquiryType; extracted: Extracted | undefined; draft: string | undefined; contact: string | null }) => Promise<void>;
  markDisclosed: (conversationId: string) => Promise<void>;
  postCallback: (url: string, body: KakaoSkillResponse) => Promise<boolean>;
  defer: (task: () => Promise<void>) => void; // 라우트에서는 next/server의 after
  now: () => number;
  wait: (ms: number) => Promise<void>;
  budgetMs: number;
  log: (e: Record<string, unknown>) => void;
};

export function inquiryType(intent: ConsultIntent): InquiryType {
  if (intent === "booking") return "booking";
  if (intent === "complaint") return "complaint";
  return "other";
}

const FALLBACK: ConsultResult = { mode: "escalate", reply: "", confidence: 0, intent: "unknown", promptVersion: CONSULT_PROMPT_VERSION, reason: "ai_unavailable" };
const NO_DISCLOSE: ReplyContext = { disclosureText: "", discloseFirst: false, disclosedAt: null };
const TIMEOUT = Symbol("timeout");

type Reply = { response: KakaoSkillResponse; text: string; role: "ai" | "system"; disclose: boolean };

// 엔진 결과 → 손님에게 보낼 스킬 응답 (자동 답변이면 첫 답변에 고지 문구)
function buildReply(r: ConsultResult, ctx: ReplyContext): Reply {
  if (r.mode === "auto") {
    const disclose = ctx.discloseFirst && !ctx.disclosedAt && ctx.disclosureText.trim().length > 0;
    const text = disclose ? `${ctx.disclosureText.trim()}\n\n${r.reply}` : r.reply;
    return { response: simpleTextResponse(text), text, role: "ai", disclose };
  }
  return { response: escalateResponse(), text: ESCALATE_TEXT, role: "system", disclose: false };
}

export async function handleKakaoSkill(token: string, raw: unknown, deps: KakaoWebhookDeps, start = deps.now()): Promise<KakaoSkillResponse> {
  const log = (outcome: string, extra: Record<string, unknown> = {}) => deps.log({ channel: "kakao", outcome, ms: deps.now() - start, ...extra });

  // 1. 채널 확인
  if (!TOKEN_RE.test(token)) return (log("bad_token"), guidanceResponse());
  const msg = parseSkillRequest(raw);
  if (!msg) return (log("bad_request"), guidanceResponse());
  const len = msg.text.length;
  const key = deps.hashKey();
  if (!key) return (log("no_hash_key", { len }), guidanceResponse()); // 비밀값이 없으면 기능 꺼짐
  const ch = await deps.findChannel(token).catch(() => null);
  if (!ch || !ch.enabled || ch.channel !== "kakao") return (log("channel_off", { len }), guidanceResponse());
  if (!botMatches(ch.external_id, msg.accountId)) return (log("bot_mismatch", { len }), guidanceResponse());
  // 사용권 확인은 지금 시작해 요청 제한·저장과 함께 돈다(3.5초 예산을 늘리지 않게)
  const licenseP: Promise<LicenseState> = deps.licenseState ? deps.licenseState(ch.shop_id).catch((): LicenseState => "ok") : Promise.resolve("ok");

  // 3-1. 샵 요청 제한 (넘으면 저장도 하지 않는다 — 도배 방지)
  if (!(await deps.rateOk("consult_shop", ch.shop_id))) return (log("rate_shop", { len }), busyResponse());

  // 2. 손님 메시지 저장·중복 제거
  const userHash = hashExternalId("kakao", msg.externalUserId, key);
  const given = msg.messageId ? `kakao:${ch.id}:${msg.messageId}` : null;
  const messageId =
    given && given.length <= 200
      ? given
      : hashExternalId("kakao-utterance", `${ch.id}|${msg.externalUserId}|${msg.messageId ?? Math.floor(deps.now() / UTTERANCE_BUCKET_MS)}|${msg.text}`, key);
  const { contact, masked } = extractContact(msg.text);
  const rec = await deps.recordCustomerMessage({ channelId: ch.id, userHash, messageId, text: masked }).catch(() => null);
  if (!rec) return (log("record_failed", { len }), guidanceResponse());
  if (rec.duplicate) return (log("duplicate", { len }), duplicateResponse());
  const conversationId = rec.conversationId;

  const safely = (path: string, task: () => Promise<void>) =>
    deps.defer(async () => {
      try {
        await task();
      } catch (e) {
        log("after_failed", { len, path, error: (e as Error)?.name ?? "error" });
      }
    });

  // 3-0. 사용권이 없거나(no_license) 이번 달 포함 응답을 다 썼으면(monthly_quota) 엔진(AI)을 부르지 않고 사장님께 넘긴다(초안 없음)
  const license = await licenseP;
  if (license !== "ok") {
    log(license === "monthly_quota" ? "monthly_quota" : "license_off", { len });
    safely("license", async () => {
      await deps.recordReply({ conversationId, role: "system", text: ESCALATE_TEXT, intent: "unknown", confidence: 0, promptVersion: CONSULT_PROMPT_VERSION, delivery: "sent" });
      await deps.openInquiry({ conversationId, type: "other", extracted: undefined, draft: undefined, contact });
    });
    return escalateResponse();
  }

  // 3-2. 대화 요청 제한: AI를 부르지 않고 상담 연결 안내 + 사장님께 문의로 넘긴다(열린 문의가 있으면 그 문의에 합친다)
  if (!(await deps.rateOk("consult_conversation", conversationId))) {
    log("rate_conversation", { len });
    safely("rate", () => deps.openInquiry({ conversationId, type: "other", extracted: undefined, draft: undefined, contact }));
    return busyResponse();
  }

  // 4. 엔진 (남은 시간 안에 끝나는지)
  const engine = deps.runConsult({ shopId: ch.shop_id, conversationId, text: msg.text, channel: "kakao" }).catch(() => FALLBACK);
  const ctxP = deps.replyContext(ch.shop_id, conversationId).catch(() => NO_DISCLOSE);
  const remaining = Math.max(0, deps.budgetMs - (deps.now() - start));
  const first = await Promise.race([engine, deps.wait(remaining).then((): typeof TIMEOUT => TIMEOUT)]);

  // 저장·문의·고지 표시 (손님 응답을 늦추지 않게 after()에서)
  const finish = async (r: ConsultResult, reply: Reply, delivery: DeliveryStatus) => {
    await deps.recordReply({ conversationId, role: reply.role, text: reply.text, intent: r.intent, confidence: r.confidence, promptVersion: r.promptVersion, delivery });
    if (r.mode === "escalate" || contact) await deps.openInquiry({ conversationId, type: inquiryType(r.intent), extracted: r.extracted, draft: r.draft, contact });
    if (reply.disclose && delivery === "sent") await deps.markDisclosed(conversationId);
  };
  if (first !== TIMEOUT) {
    const reply = buildReply(first, await ctxP);
    log("reply", { len, path: "immediate", mode: first.mode, intent: first.intent, reason: first.reason });
    safely("immediate", () => finish(first, reply, "sent"));
    return reply.response;
  }

  const callbackUrl = msg.replyUrl && callbackUrlAllowed(msg.replyUrl) ? msg.replyUrl : null;
  if (callbackUrl) {
    // 콜백: 지금은 대기 문구, 엔진이 끝나면 한 번만 POST (실패해도 다시 보내지 않는다)
    log("callback_wait", { len, path: "callback" });
    safely("callback", async () => {
      const r = await engine;
      const reply = buildReply(r, await ctxP);
      const ok = await deps.postCallback(callbackUrl, reply.response).catch(() => false);
      log(ok ? "callback_sent" : "callback_failed", { len, path: "callback", mode: r.mode, intent: r.intent, reason: r.reason });
      await finish(r, reply, ok ? "sent" : "failed");
    });
    return callbackAck();
  }

  // 콜백을 쓸 수 없으면(블록 콜백 꺼짐) 사람에게 넘긴다고 바로 답하고, 늦게 나온 답은 보내지 못한 채(skipped) 문의 초안으로
  log("late_no_callback", { len, path: "late" });
  safely("late", async () => {
    const r = await engine;
    await deps.recordReply({ conversationId, role: "system", text: ESCALATE_TEXT, intent: r.intent, confidence: r.confidence, promptVersion: r.promptVersion, delivery: "sent" });
    if (r.mode === "auto") {
      await deps.recordReply({ conversationId, role: "ai", text: r.reply, intent: r.intent, confidence: r.confidence, promptVersion: r.promptVersion, delivery: "skipped" });
    }
    await deps.openInquiry({ conversationId, type: inquiryType(r.intent), extracted: r.extracted, draft: r.mode === "auto" ? r.reply : r.draft, contact });
  });
  return escalateResponse();
}

const json = (body: KakaoSkillResponse) => Response.json(body, { status: 200 });

// 라우트 핸들러 본체. 어떤 경우에도 200 + 스킬 JSON (카카오 봇이 오류 말풍선을 띄우지 않게)
export async function kakaoRoute(req: Request, token: string, deps: KakaoWebhookDeps): Promise<Response> {
  const start = deps.now();
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return json(guidanceResponse());
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return json(guidanceResponse());
    raw = JSON.parse(text);
  } catch {
    return json(guidanceResponse());
  }
  try {
    return json(await handleKakaoSkill(token, raw, deps, start));
  } catch (e) {
    deps.log({ channel: "kakao", outcome: "error", error: (e as Error)?.name ?? "error" });
    return json(guidanceResponse());
  }
}
