import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AiContent, AiFeature, AiRequest, AiTransport } from "./types";
import { mockTransport } from "./mock";

// AI 호출은 이 함수 하나로 한다. 결과는 제안일 뿐이고(DB에 바로 쓰지 않는다), 실패·꺼짐·상한 초과는 null → 호출부가 수동 흐름.
// - 도구 호출(tool use)로 JSON 스키마를 강제하고, parse로 한 번 더 검증한다.
// - 15초 타임아웃, 실패 시 1회 재시도, 사용량은 성공·실패 모두 ai_usage에 남긴다.

const TIMEOUT_MS = 15_000;

export type Gate = { allowed: boolean; reason: string; model: string };
export type AiDeps = {
  gate: (shopId: string | null, feature: AiFeature) => Promise<Gate | null>;
  record: (u: { shopId: string | null; userId: string | null; feature: AiFeature; model: string; input: number; output: number; ok: boolean }) => Promise<void>;
  transport: () => AiTransport | null;
};

export function aiKeyConfigured() {
  return !!process.env.ANTHROPIC_API_KEY || process.env.AI_MOCK === "1";
}

const sdkTransport: AiTransport = async (req, signal) => {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
  const msg = await client.messages.create(
    {
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: "user", content: req.content as Anthropic.MessageParam["content"] }],
      tools: [{ name: req.toolName, description: "결과를 이 형식으로 돌려준다", input_schema: req.schema as Anthropic.Tool.InputSchema }],
      tool_choice: { type: "tool", name: req.toolName },
    },
    { signal },
  );
  const tool = msg.content.find((b) => b.type === "tool_use");
  return { input: tool && tool.type === "tool_use" ? tool.input : null, usage: { input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens } };
};

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
};

export async function callStructured<T>(call: StructuredCall<T>, deps: AiDeps = defaultDeps): Promise<T | null> {
  const transport = deps.transport();
  if (!transport) return null;
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
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await transport(req, ctrl.signal);
      const parsed = call.parse(res.input);
      await deps.record({ ...ids(call), model: gate.model, input: res.usage.input_tokens, output: res.usage.output_tokens, ok: parsed !== null });
      if (parsed !== null) return parsed;
    } catch (e) {
      await deps.record({ ...ids(call), model: gate.model, input: 0, output: 0, ok: false });
      console.error("ai call failed", call.feature, attempt, e instanceof Error ? e.name : "error");
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
