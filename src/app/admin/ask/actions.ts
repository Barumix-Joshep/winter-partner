"use server";

import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { callStructured } from "@/lib/ai/client";
import { isAiEnabled } from "@/lib/ai/flags";
import { METRICS, parseQuery, QUERY_SCHEMA, QUERY_TOOL, querySystem, type Metric } from "@/lib/ai/admin-query";
import { todayKst } from "@/lib/instructor/schedule";
import { redact } from "@/lib/ai/redact";

export type AskState = { metric?: Metric; month?: string; rows?: { label: string; value: number }[]; message?: string };

// 질문(AI가 집계를 고름) 또는 직접 고른 집계를 실행한다. 실행은 정의된 DB 함수(admin_metric)뿐.
export async function ask(_prev: AskState | undefined, formData: FormData): Promise<AskState> {
  const user = await requireArea("admin");
  const today = todayKst(Date.now());
  let metric = String(formData.get("metric") ?? "") as Metric;
  let month = String(formData.get("month") ?? "") || today.slice(0, 7);
  const question = String(formData.get("question") ?? "").trim().slice(0, 300);
  if (question) {
    if (!(await isAiEnabled(null, "admin_query"))) return { message: "AI 질의가 꺼져 있습니다. 목록에서 직접 골라 주세요." };
    // 질문 속 연락처는 지우고 보낸다 (집계 질문에는 필요 없다)
    const r = await callStructured({
      feature: "admin_query",
      shopId: null,
      userId: user.id,
      system: querySystem(today),
      content: `${redact(question).text}\n(오늘 ${today})`,
      toolName: QUERY_TOOL,
      schema: QUERY_SCHEMA,
      parse: parseQuery,
      maxTokens: 100,
    });
    if (!r?.metric) return { message: "맞는 집계를 찾지 못했습니다. 목록에서 골라 주세요." };
    metric = r.metric;
    month = r.month ?? month;
  }
  if (!(metric in METRICS) || !/^\d{4}-\d{2}$/.test(month)) return { message: "집계와 월을 골라 주세요." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_metric", { p_metric: metric, p_month: `${month}-01` });
  if (error) return { message: "집계를 실행하지 못했습니다." };
  return { metric, month, rows: ((data ?? []) as { label: string; value: number }[]).map((r) => ({ label: r.label, value: Number(r.value) })) };
}
