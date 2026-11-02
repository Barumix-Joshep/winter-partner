// E 관리자 질의: 질문 → 미리 정의한 집계 하나와 월. AI는 고르기만 하고 SQL은 만들지 않는다.
export const METRICS = {
  jobs_by_shop: "샵별 강습 수",
  jobs_by_status: "상태별 강습 수",
  settlement_gross_by_shop: "샵별 정산 강습료 합계",
  new_customers_by_shop: "샵별 새 손님 수",
  bid_win_rate: "입찰 수와 선정 수",
  new_instructors: "새로 가입한 강사 수",
  customer_cancels_by_shop: "샵별 손님·샵 취소 수",
  instructor_cancels: "강사별 일방 취소 수",
  active_shops: "강습이 있었던 샵 수",
  ai_cost_by_feature: "AI 기능별 비용",
  pilot_first_job_hours: "샵별 가입부터 첫 강습 등록까지 걸린 시간(시간)",
  pilot_weekly_jobs: "최근 8주 주간 강습 등록 수",
  bid_participation_by_shop: "샵별 입찰 공고 중 입찰이 들어온 비율(%)",
  cancel_rate_by_shop: "샵별 강습 취소율(%)",
  ai_calls_by_shop: "샵별 AI 호출 수",
} as const;
export type Metric = keyof typeof METRICS;

export const QUERY_TOOL = "choose_metric";
export function querySystem(todayKst: string) {
  return [
    "너는 강사 매칭 플랫폼 본사의 질문을 미리 정해진 집계 하나로 바꾼다. 맞는 집계가 없으면 metric을 null로.",
    `오늘은 ${todayKst}(한국 시간). "이번 달", "지난달" 같은 말은 이 날짜 기준으로 YYYY-MM을 정한다. 월이 없으면 이번 달.`,
    "집계 목록:",
    ...Object.entries(METRICS).map(([k, v]) => `- ${k}: ${v}`),
  ].join("\n");
}
export const QUERY_SCHEMA = {
  type: "object",
  properties: {
    metric: { type: ["string", "null"], enum: [...Object.keys(METRICS), null] },
    month: { type: ["string", "null"], description: "YYYY-MM" },
  },
  required: ["metric", "month"],
} as const;

export function parseQuery(input: unknown): { metric: Metric | null; month: string | null } | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const metric = typeof o.metric === "string" && o.metric in METRICS ? (o.metric as Metric) : null;
  const month = typeof o.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(o.month) ? o.month : null;
  return { metric, month };
}
