// D3 강사 최근 활동 요약 (본사): 숫자만 보내고 이름은 보내지 않는다. 판단은 본사 담당자가.
export const ACTIVITY_TOOL = "summarize_activity";
export const ACTIVITY_SYSTEM =
  "너는 강사 매칭 플랫폼 본사 담당자를 돕는다. 한 강사의 최근 30일 활동 숫자를 보고 2문장으로 요약한다. " +
  "단정하거나 처벌을 권하지 말고, 확인해 볼 점을 중립적으로 적는다.";
export const ACTIVITY_SCHEMA = {
  type: "object",
  properties: { summary: { type: "string" } },
  required: ["summary"],
} as const;

const LABEL: Record<string, string> = {
  bids_30d: "입찰",
  bids_won_30d: "선정된 입찰",
  lessons_done_30d: "완료 강습",
  cancels_30d: "일방 취소",
  penalty_points: "누적 패널티 점수",
  offers_declined_30d: "거절한 직접 의뢰",
  avg_rating: "평균 평점",
};

export function activityPrompt(stats: Record<string, unknown>) {
  return Object.entries(LABEL)
    .map(([k, label]) => `${label}: ${stats[k] ?? "없음"}`)
    .join("\n");
}

export function parseActivity(input: unknown): string | null {
  return input && typeof input === "object" && typeof (input as { summary?: unknown }).summary === "string"
    ? (input as { summary: string }).summary.slice(0, 300)
    : null;
}
