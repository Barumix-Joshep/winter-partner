"use server";

import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { callStructured } from "@/lib/ai/client";
import { isAiEnabled } from "@/lib/ai/flags";
import { ACTIVITY_SCHEMA, ACTIVITY_SYSTEM, ACTIVITY_TOOL, activityPrompt, parseActivity } from "@/lib/ai/activity";

export type ActivityState = { summary?: string; message?: string };

// 강사 최근 활동 요약 (본사, 숫자만 전송)
export async function summarizeActivity(_prev: ActivityState | undefined, formData: FormData): Promise<ActivityState> {
  const user = await requireArea("admin");
  if (!(await isAiEnabled(null, "admin_query"))) return { message: "지금은 AI 요약을 쓸 수 없습니다." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_instructor_activity", { p_instructor_id: String(formData.get("id") ?? "") });
  if (error || !data) return { message: "활동을 불러오지 못했습니다." };
  const r = await callStructured({
    feature: "admin_query",
    shopId: null,
    userId: user.id,
    system: ACTIVITY_SYSTEM,
    content: activityPrompt(data as Record<string, unknown>),
    toolName: ACTIVITY_TOOL,
    schema: ACTIVITY_SCHEMA,
    parse: parseActivity,
    maxTokens: 300,
  });
  return r ? { summary: r } : { message: "요약하지 못했습니다." };
}
