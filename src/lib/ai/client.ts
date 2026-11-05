import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AiContent, AiFeature, AiRequest, AiTransport } from "./types";
import { mockTransport } from "./mock";
import { LIMITS, limitKey } from "@/lib/ops/limits";

// AI 호출은 이 함수 하나로 한다. 결과는 제안일 뿐이고(DB에 바로 쓰지 않는다), 실패·꺼짐·상한 초과는 null → 호출부가 수동 흐름.
// - 도구 호출(tool use)로 JSON 스키마를 강제하고, parse로 한 번 더 검증한다.
// - 기본 15초 타임아웃, 실패 시 1회 재시도(호출별로 timeoutMs·retries를 바꿀 수 있다 — AI 상담 카카오 경로는 짧게), 사용량은 성공·실패 모두 ai_usage에 남긴다.

const TIMEOUT_MS = 15_000;

export type Gate = { allowed: boolean; reason: string; model: string };
export type AiDeps = {
  gate: (shopId: string | null, feature: AiFeature) => Promise<Gate | null>;
  record: (u: { shopId: string | null; userId: string | null; feature: AiFeature; model: string; input: number; output: number; ok: boolean }) => Promise<void>;
  transport: () => AiTransport | null;
  // 사람(또는 샵)별 짧은 시간 호출 제한 (P16-3). 없으면 제한하지 않는다.
  rateOk?: (subject: string) => Promise<boolean>;
};

export function aiKeyConfigured() {
  return !!process.env.ANTHROPIC_API_KEY || process.env.AI_MOCK === "1";
}

// 강제 도구 지정(tool_choice: tool)을 지원하지 않는 모델(예: Sonnet 5.5)은 auto + 지시로 부른다. 한 번 거절되면 기억한다.
const noForcedTool = new Set<string>();

type MessagesClient = { messages: { create: (body: Anthropic.MessageCreateParamsNonStreaming, opts: { signal: AbortSignal }) => Promise<Anthropic.Message> } };

export function makeSdkTransport(client: () => MessagesClient): AiTransport {
  return async (req, signal) => {
    const send = (forced: boolean) =>
      client().messages.create(
        {
          model: req.model,
          max_tokens: req.maxTokens,
          system: forced ? req.system : `${req.system}\n반드시 ${req.toolName} 도구를 한 번 호출해 결과를 돌려준다. 도구 밖에 글을 쓰지 않는다.`,
          messages: [{ role: "user", content: req.content as Anthropic.MessageParam["content"] }],
          tools: [{ name: req.toolName, description: "결과를 이 형식으로 돌려준다", input_schema: req.schema as Anthropic.Tool.InputSchema }],
          tool_choice: forced ? { type: "tool", name: req.toolName } : { type: "auto" },
        },
        { signal },
      );
    let msg: Anthropic.Message;
    if (noForcedTool.has(req.model)) {
      msg = await send(false);
    } else {
      try {
        msg = await send(true);
      } catch (e) {
        const err = e as { status?: number; message?: string };
        if (err?.status === 400 && /tool_choice/.test(String(err?.message ?? ""))) {
          noForcedTool.add(req.model);
          msg = await send(false);
        } else {
          throw e;
        }
      }
    }
    const tool = msg.content.find((b) => b.type === "tool_use" && b.name === req.toolName);
    return { input: tool && tool.type === "tool_use" ? tool.input : null, usage: { input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens } };
  };
}

const sdkTransport = makeSdkTransport(() => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 }));

export const defaultDeps: AiDeps = {
  async gate(shopId, feature) {
    const { data, error } = await createAdminClient().rpc("ai_gate", { p_shop_id: shopId, p_feature: feature });
    if (error) return null;
    return ((data ?? [])[0] as Gate | undefined) ?? null;
  },
  async record(u) {
    await createAdminClient().rpc("record_ai_usage", {
      p_shop_id: u.shopId,
      p_user_id: u.userId,
      p_feature: u.feature,
      p_model: u.model,
      p_input_tokens: u.input,
      p_output_tokens: u.output,
      p_ok: u.ok,
    });
  },
  async rateOk(subject) {
    const { data, error } = await createAdminClient().rpc("public_rate_limit", {
      p_key: limitKey("ai_user", subject),
      p_max: LIMITS.ai_user.max,
      p_window_seconds: LIMITS.ai_user.windowSeconds,
    });
    return !!error || data !== false;
  },
  transport() {
    if (process.env.AI_MOCK === "1") return mockTransport;
    return process.env.ANTHROPIC_API_KEY ? sdkTransport : null;
  },
};

export type StructuredCall<T> = {
  feature: AiFeature;
  shopId: string | null;
  userId: string | null;
  system: string;
  content: AiContent;
  toolName: string;
  schema: Record<string, unknown>;
  parse: (input: unknown) => T | null;
  maxTokens?: number;
  timeoutMs?: number; // 기본 15초
  retries?: number; // 실패 뒤 다시 부르는 횟수, 기본 1
  // 짧은 시간 호출 제한을 셀 단위. 기본은 userId ?? shopId. AI 상담은 손님이 로그인하지 않으므로 대화 단위("consult:<대화 id>")로 센다.
  rateSubject?: string | null;
};

export async function callStructured<T>(call: StructuredCall<T>, deps: AiDeps = defaultDeps): Promise<T | null> {
  const transport = deps.transport();
  if (!transport) return null;
  const subject = call.rateSubject !== undefined ? call.rateSubject : (call.userId ?? call.shopId);
  if (subject && deps.rateOk && !(await deps.rateOk(subject))) return null; // 수동 흐름
  const gate = await deps.gate(call.shopId, call.feature);
  if (!gate?.allowed) return null;

  const req: AiRequest = {
    model: gate.model,
    system: call.system,
    content: call.content,
    toolName: call.toolName,
    schema: call.schema,
    maxTokens: call.maxTokens ?? 1024,
  };
  const attempts = 1 + Math.max(0, call.retries ?? 1);
  for (let attempt = 0; attempt < attempts; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), call.timeoutMs ?? TIMEOUT_MS);
    try {
      const res = await transport(req, ctrl.signal);
      const parsed = call.parse(res.input);
      await deps.record({ ...ids(call), model: gate.model, input: res.usage.input_tokens, output: res.usage.output_tokens, ok: parsed !== null });
      if (parsed !== null) return parsed;
    } catch (e) {
      await deps.record({ ...ids(call), model: gate.model, input: 0, output: 0, ok: false });
      // 상태 코드·오류 종류·메시지 앞부분만 (요청 본문·키는 남기지 않는다)
      const err = e as { status?: number; name?: string; message?: string; error?: { error?: { type?: string } } };
      console.error("ai call failed", call.feature, attempt, err?.status ?? "-", err?.error?.error?.type ?? err?.name ?? "error", String(err?.message ?? "").slice(0, 200));
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

const ids = (c: { feature: AiFeature; shopId: string | null; userId: string | null }) => ({ feature: c.feature, shopId: c.shopId, userId: c.userId });

// 화면에 AI 버튼을 보여 줄지 (키·플랫폼 기본값·샵 설정·상한)
export async function isAiEnabled(shopId: string | null, feature: AiFeature, deps: AiDeps = defaultDeps) {
  if (!deps.transport()) return false;
  const g = await deps.gate(shopId, feature);
  return !!g?.allowed;
}
