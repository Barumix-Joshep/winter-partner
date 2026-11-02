"use server";

import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shop/my-shop";
import { callStructured } from "@/lib/ai/client";
import { isAiEnabled } from "@/lib/ai/flags";
import { parseRevisit, REVISIT_SCHEMA, REVISIT_SYSTEM, REVISIT_TOOL, revisitPrompt, type RevisitCandidate } from "@/lib/ai/revisit";

export type RevisitState = { drafts?: Record<string, string>; message?: string };

// 재방문 안내 문구 초안 (최대 20명). 대상은 DB가 다시 고른다(광고 동의 유효한 손님만).
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState 규약상 받는 인자
export async function draftRevisit(_prev: RevisitState | undefined, _formData: FormData): Promise<RevisitState> {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop || !(await isAiEnabled(shop.id, "revisit"))) return { message: "지금은 문구 초안을 쓸 수 없습니다." };
  const supabase = await createClient();
  const { data } = await supabase.rpc("revisit_candidates", { p_shop_id: shop.id });
  const list = (data ?? []) as RevisitCandidate[];
  if (list.length === 0) return { message: "대상 손님이 없습니다." };
  const { text, labels } = revisitPrompt(shop.name, list);
  const r = await callStructured({
    feature: "revisit",
    shopId: shop.id,
    userId: user.id,
    system: REVISIT_SYSTEM,
    content: text,
    toolName: REVISIT_TOOL,
    schema: REVISIT_SCHEMA,
    parse: (x) => parseRevisit(x, labels),
    maxTokens: 2000,
  });
  return r ? { drafts: r } : { message: "문구를 만들지 못했습니다. 직접 써 주세요." };
}
