// A4 손님 카드 요약: 강습 이력·수업 메모·연락 기록·샵 메모 → 3줄 요약, 다음 강습 제안, 연락 문구 초안.
// 이름·연락처는 바꾸거나 지우고 보낸다. 연락 문구는 광고 수신 동의가 유효한 손님에게만 만든다.
import { redact, restore } from "./redact";

export type SummaryInput = {
  name: string;
  linkedNames: string[];
  level: string | null;
  memo: string | null;
  lessons: { date: string; sport: string | null; lesson: string; status: string; note: string | null }[];
  contacts: { date: string; channel: string; memo: string | null }[];
  marketingOk: boolean;
};

export type CustomerSummary = { summary: string[]; nextLesson: string | null; contactDraft: string | null };

export const SUMMARY_TOOL = "summarize_customer";
export const SUMMARY_SYSTEM =
  "너는 스키·스노보드 렌탈샵 사장님을 돕는다. 손님 기록을 읽고 다음 강습 준비와 연락에 쓸 요약을 만든다. " +
  "요약은 3줄 이내로 진도·특징·주의할 점(건강 정보 제외)을 적는다. 다음 강습 제안은 레벨 다음 단계를 한 문장으로. " +
  "연락 문구는 손님에게 보낼 짧은 문자(2~3문장, 존댓말, 과장 금지)이고, 요청이 없으면 null. 기록에 없는 사실은 만들지 않는다.";
export const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "array", items: { type: "string" }, maxItems: 3 },
    next_lesson: { type: ["string", "null"] },
    contact_draft: { type: ["string", "null"] },
  },
  required: ["summary", "next_lesson", "contact_draft"],
} as const;

export function summaryPrompt(i: SummaryInput) {
  const names = [i.name, ...i.linkedNames];
  const r = (t: string | null) => (t ? redact(t, names).text : "");
  const head = redact(i.name, names);
  const lines = [
    `손님: ${head.text} · 레벨 ${i.level ?? "모름"}`,
    i.memo ? `샵 메모: ${r(i.memo)}` : null,
    "강습 이력 (최근순):",
    ...i.lessons.slice(0, 10).map((l) => `- ${l.date} ${l.sport ?? ""} ${l.lesson} (${l.status})${l.note ? ` 수업 메모: ${r(l.note)}` : ""}`),
    i.contacts.length ? "연락 기록:" : null,
    ...i.contacts.slice(0, 5).map((c) => `- ${c.date} ${c.channel}${c.memo ? `: ${r(c.memo)}` : ""}`),
    i.marketingOk ? "연락 문구 초안을 만들어 주세요 (광고 수신 동의 있음)." : "연락 문구는 만들지 마세요 (contact_draft = null).",
  ].filter((x): x is string => x !== null);
  return { text: lines.join("\n"), aliases: redact(names.join(" "), names).aliases };
}

export function parseSummary(input: unknown, aliases: Record<string, string>, marketingOk: boolean): CustomerSummary | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (!Array.isArray(o.summary)) return null;
  const back = (t: string) => restore(t, aliases);
  return {
    summary: o.summary.filter((x): x is string => typeof x === "string").slice(0, 3).map((x) => back(x.slice(0, 200))),
    nextLesson: typeof o.next_lesson === "string" ? back(o.next_lesson.slice(0, 200)) : null,
    // 동의가 없으면 모델이 만들어도 버린다
    contactDraft: marketingOk && typeof o.contact_draft === "string" ? back(o.contact_draft.slice(0, 400)) : null,
  };
}
