import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { callStructured, defaultDeps, type AiDeps } from "@/lib/ai/client";
import { hasContact, redact } from "@/lib/ai/redact";
import { unknownAmounts } from "./amounts";
import { rankKnowledge } from "./kb";
import { CONSULT_PROMPT_VERSION, CONSULT_SCHEMA, CONSULT_TOOL, consultContent, consultSystem, parseConsult } from "./prompt";
import { fitChannel, preCheck } from "./rules";
import { AUTO_INTENTS, type ConsultInput, type ConsultResult, type ConsultSettings, type EscalateReason, type KbEntry } from "./types";

// AI 상담 엔진 (채널을 모른다). 순서(설계 문서): 고정 규칙 → 안내 정보 검색 → AI 1회 → 스키마 검증 → 금액 대조 → 채널 길이.
// 자동 답변은 샵이 켜고, 의도가 안내 정보 사실(가격·시간·위치·정책·FAQ)이고, 신뢰도가 기준 이상이고, 답 속 금액이 모두 안내 정보에 있을 때만.
// 나머지(예약·협상·불만·모름·인젝션·AI 꺼짐·상한 초과·실패)는 escalate — 사장님께 넘기고 초안만 보여 준다(CLAUDE.md 예외).
// 로그에는 손님 글을 쓰지 않는다(길이·의도만).

export const ESCALATE_REPLY = "문의 감사합니다! 사장님께 전달했어요. 확인 후 곧 답드릴게요.";

export type ConsultContext = { settings: ConsultSettings; kb: KbEntry[] };
export type EngineDeps = { loadContext: (shopId: string) => Promise<ConsultContext | null>; ai: AiDeps; log?: (e: Record<string, unknown>) => void };

export async function loadConsultContext(shopId: string): Promise<ConsultContext | null> {
  const db = createAdminClient();
  const [{ data: shop }, { data: settings }, { data: kb }] = await Promise.all([
    db.from("shops").select("name").eq("id", shopId).maybeSingle(),
    db.from("shop_consult_settings").select("auto_reply_enabled, confidence_threshold").eq("shop_id", shopId).maybeSingle(),
    db.from("shop_knowledge").select("id, kind, title, content").eq("shop_id", shopId).eq("is_active", true).order("sort"),
  ]);
  if (!shop) return null;
  return {
    settings: { autoReply: !!settings?.auto_reply_enabled, threshold: Number(settings?.confidence_threshold ?? 0.85), shopName: shop.name as string },
    kb: (kb ?? []) as KbEntry[],
  };
}

const defaultEngineDeps: EngineDeps = {
  loadContext: loadConsultContext,
  ai: defaultDeps,
  log: (e) => console.info("consult", JSON.stringify(e)),
};

export async function runConsult(input: ConsultInput, deps: EngineDeps = defaultEngineDeps): Promise<ConsultResult> {
  const escalate = (reason: EscalateReason, extra: Partial<ConsultResult> = {}): ConsultResult => {
    const r: ConsultResult = { mode: "escalate", reply: ESCALATE_REPLY, confidence: 0, intent: "unknown", promptVersion: CONSULT_PROMPT_VERSION, reason, ...extra };
    deps.log?.({ mode: r.mode, reason, intent: r.intent, len: (input.text ?? "").length, channel: input.channel });
    return r;
  };

  // 1. 고정 규칙
  const pre = preCheck(input.text);
  if (!pre.ok) return escalate(pre.reason);

  // 2. 안내 정보
  const ctx = await deps.loadContext(input.shopId);
  if (!ctx) return escalate("ai_unavailable");
  const kb = rankKnowledge(pre.text, ctx.kb);

  // 3. AI (연락처·이메일은 가린 뒤). 카카오는 5초 안에 답해야 해서 3.5초·재시도 없음(넘으면 어댑터가 콜백으로, P22-3)
  // 게이트가 사용권 이유(no_license·monthly_quota, P23-2)로 막으면 그 이유를 남긴다. 그 밖의 막힘은 지금처럼 ai_unavailable.
  let blocked: EscalateReason = "ai_unavailable";
  const out = await callStructured(
    {
      feature: "consult",
      shopId: input.shopId,
      userId: null,
      rateSubject: `consult:${input.conversationId}`,
      system: consultSystem(ctx.settings.shopName, kb),
      content: consultContent(redact(pre.text).text),
      toolName: CONSULT_TOOL,
      schema: CONSULT_SCHEMA as unknown as Record<string, unknown>,
      parse: parseConsult, // 4. 스키마 검증
      maxTokens: 600,
      timeoutMs: input.channel === "kakao" ? 3_500 : 10_000,
      retries: input.channel === "kakao" ? 0 : 1,
      onGate: (g) => {
        if (g && !g.allowed && (g.reason === "no_license" || g.reason === "monthly_quota")) blocked = g.reason;
      },
    },
    deps.ai,
  );
  if (!out) return escalate(blocked);

  const base = { confidence: out.confidence, intent: out.intent, extracted: Object.keys(out.extracted).length ? out.extracted : undefined };
  const draft = (out.draft || out.reply).slice(0, 2000) || undefined;
  if (!(AUTO_INTENTS as readonly string[]).includes(out.intent)) return escalate("intent", { ...base, draft });
  if (!kb.length) return escalate("no_kb", { ...base, draft });
  if (!out.reply) return escalate("intent", { ...base, intent: "unknown", draft });
  if (out.confidence < ctx.settings.threshold) return escalate("low_confidence", { ...base, draft });
  // 5. 금액 대조: 답에 쓴 금액이 하나라도 안내 정보에 없으면 사람에게
  if (unknownAmounts(out.reply, kb.map((i) => `${i.title} ${i.content}`))) return escalate("amount_not_in_kb", { ...base, draft });
  if (hasContact(out.reply)) return escalate("contact_in_reply", { ...base, draft });
  if (!ctx.settings.autoReply) return escalate("auto_off", { ...base, draft });

  // 6. 채널 길이
  const result: ConsultResult = { mode: "auto", reply: fitChannel(out.reply, input.channel), promptVersion: CONSULT_PROMPT_VERSION, ...base };
  deps.log?.({ mode: "auto", intent: out.intent, len: input.text.length, replyLen: result.reply.length, channel: input.channel });
  return result;
}
