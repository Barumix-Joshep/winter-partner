import "server-only";
import { callStructured } from "./client";
import { HEALTH_SCHEMA, HEALTH_SYSTEM, HEALTH_TOOL, healthPayload, parseHealth, shouldAskHealthAi } from "./note";

// D2: 정규식이 못 찾은 메모를 AI가 한 번 더 본다 (꺼져 있거나 실패하면 빈 목록 = 1차 결과만)
export async function aiHealthCategories(text: string | null | undefined, regexHits: string[], ctx: { shopId: string | null; userId: string; names?: string[] }) {
  if (!shouldAskHealthAi(text, regexHits)) return [];
  const r = await callStructured({
    feature: "health_check",
    shopId: ctx.shopId,
    userId: ctx.userId,
    system: HEALTH_SYSTEM,
    content: healthPayload(text!.slice(0, 2000), ctx.names),
    toolName: HEALTH_TOOL,
    schema: HEALTH_SCHEMA,
    parse: parseHealth,
    maxTokens: 150,
  });
  return r ?? [];
}
