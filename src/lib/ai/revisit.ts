// C1 재방문 안내 문구 초안: 광고 동의가 유효한 손님만, 이름은 손님1·2로 바꿔 보낸다. 발송은 샵이 직접(복사용).
export type RevisitCandidate = { customer_id: string; name: string; level: string | null; lessons: number; last_lesson: string | null; sport: string | null };

export const REVISIT_TOOL = "draft_revisit_messages";
export const REVISIT_SYSTEM =
  "너는 스키·스노보드 렌탈샵이 지난 시즌 손님에게 보낼 시즌 안내 문자를 쓴다. 손님마다 2~3문장, 존댓말, 과장·할인 약속 금지. " +
  "광고 문자이므로 반드시 '(광고) '로 시작하고 샵 이름을 넣는다. 레벨의 다음 단계 강습을 한 가지 제안하고, 마지막에 '수신을 원치 않으시면 말씀해 주세요.'를 붙인다. 이름 자리는 손님 표시(손님1 등)를 그대로 쓴다.";
export const REVISIT_SCHEMA = {
  type: "object",
  properties: { messages: { type: "array", items: { type: "object", properties: { label: { type: "string" }, message: { type: "string" } }, required: ["label", "message"] } } },
  required: ["messages"],
} as const;

export function revisitPrompt(shopName: string, list: RevisitCandidate[]) {
  const labeled = list.slice(0, 20).map((c, i) => ({ ...c, label: `손님${i + 1}` }));
  const text = [
    `샵: ${shopName}`,
    ...labeled.map((c) => `- ${c.label}: ${c.sport ?? "스키"}, 레벨 ${c.level ?? "모름"}, 지난 시즌 강습 ${c.lessons}회, 마지막 강습 ${c.last_lesson ?? "모름"}`),
  ].join("\n");
  return { text, labels: new Map(labeled.map((c) => [c.label, c])) };
}

export function parseRevisit(input: unknown, labels: Map<string, RevisitCandidate>): Record<string, string> | null {
  if (!input || typeof input !== "object" || !Array.isArray((input as { messages?: unknown }).messages)) return null;
  const out: Record<string, string> = {};
  for (const m of (input as { messages: unknown[] }).messages) {
    if (!m || typeof m !== "object") continue;
    const { label, message } = m as { label?: unknown; message?: unknown };
    const c = typeof label === "string" ? labels.get(label.trim()) : undefined;
    if (c && typeof message === "string") {
      const text = message.slice(0, 400).split(label as string).join(c.name).trim();
      // 광고성 문자 표시 의무: 모델이 빠뜨리면 붙인다
      out[c.customer_id] = text.startsWith("(광고)") ? text : `(광고) ${text}`;
    }
  }
  return out;
}
