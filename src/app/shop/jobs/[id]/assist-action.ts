"use server";

import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shop/my-shop";
import { callStructured } from "@/lib/ai/client";
import { isAiEnabled } from "@/lib/ai/flags";
import { BID_SCHEMA, BID_SYSTEM, BID_TOOL, bidPrompt, parseBidAssist, ruleFlags, type BidContext } from "@/lib/ai/bid-assist";
import { LESSON_TYPES, type LessonType } from "@/lib/shop/job";

export type AssistState = {
  recommended?: string;
  reasons?: string[];
  notes?: Record<string, string>;
  flags?: Record<string, string[]>;
  message?: string;
};

// 입찰 선정 보조: 추천·이유·장단점·경고만 돌려준다. 선정은 사장님이 기존 폼으로.
export async function assistBids(_prev: AssistState | undefined, formData: FormData): Promise<AssistState> {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  const jobId = String(formData.get("job_id") ?? "");
  if (!shop || !(await isAiEnabled(shop.id, "bid_assist"))) return { message: "지금은 추천을 쓸 수 없습니다." };
  const supabase = await createClient();
  const [{ data: ctx, error }, { data: job }, { data: levels }] = await Promise.all([
    supabase.rpc("bid_assist_context", { p_job_id: jobId }),
    supabase.from("jobs").select("lesson_type, student_count, note, instructor_rate, sports(name), job_customers(customers(name))").eq("id", jobId).eq("shop_id", shop.id).maybeSingle(),
    supabase.rpc("job_customer_levels", { p_job_id: jobId }),
  ]);
  const bids = (ctx ?? []) as BidContext[];
  if (error || !job || bids.length === 0) return { message: "추천할 입찰이 없습니다." };
  const j = job as unknown as { lesson_type: LessonType; student_count: number; note: string | null; instructor_rate: number | null; sports: { name: string } | null; job_customers: { customers: { name: string } | null }[] };
  const rules = ruleFlags(bids, j.instructor_rate);
  const { text, labels } = bidPrompt(
    {
      lessonLabel: LESSON_TYPES[j.lesson_type].label,
      studentCount: j.student_count,
      levels: ((levels ?? []) as { level: string | null }[]).map((l) => l.level).filter((l): l is string => !!l),
      note: j.note,
      ceiling: j.instructor_rate,
      sport: j.sports?.name ?? null,
      customerNames: (j.job_customers ?? []).map((c) => c.customers?.name ?? "").filter(Boolean),
    },
    bids,
  );
  const r = await callStructured({
    feature: "bid_assist",
    shopId: shop.id,
    userId: user.id,
    system: BID_SYSTEM,
    content: text,
    toolName: BID_TOOL,
    schema: BID_SCHEMA,
    parse: (x) => parseBidAssist(x, labels),
    maxTokens: 700,
  });
  if (!r) return { flags: rules, message: "추천을 만들지 못했습니다. 아래 입찰을 직접 비교해 주세요." };
  const flags: Record<string, string[]> = { ...rules };
  for (const [id, f] of Object.entries(r.flags)) flags[id] = [...(flags[id] ?? []), ...f];
  return { recommended: r.recommended, reasons: r.reasons, notes: r.notes, flags };
}
