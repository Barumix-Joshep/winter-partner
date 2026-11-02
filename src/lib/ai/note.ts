// B1 수업 메모 정리 + D2 건강정보 2차 감지
import { redact } from "./redact";

export type TidyNote = { progress: string; good: string; next: string; healthSentences: string[] };
export const TIDY_TOOL = "tidy_lesson_note";
export const TIDY_SYSTEM =
  "너는 스키·스노보드 강사의 수업 메모를 다음 강사가 보기 좋게 정리한다. 진도(어디까지 했는지), 잘된 점, 다음 과제 세 항목으로 짧게. " +
  "메모에 없는 내용은 만들지 않는다. 부상·질환·약·임신 등 건강 정보로 보이는 문장은 정리에서 빼고 health_sentences에 원문 그대로 옮긴다.";
export const TIDY_SCHEMA = {
  type: "object",
  properties: {
    progress: { type: "string" },
    good: { type: "string" },
    next: { type: "string" },
    health_sentences: { type: "array", items: { type: "string" } },
  },
  required: ["progress", "good", "next", "health_sentences"],
} as const;

export function parseTidy(input: unknown): TidyNote | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (typeof o.progress !== "string" || typeof o.good !== "string" || typeof o.next !== "string") return null;
  return {
    progress: o.progress.slice(0, 300),
    good: o.good.slice(0, 300),
    next: o.next.slice(0, 300),
    healthSentences: Array.isArray(o.health_sentences) ? o.health_sentences.filter((x): x is string => typeof x === "string").slice(0, 5).map((x) => x.slice(0, 200)) : [],
  };
}

export function formatTidy(t: TidyNote) {
  return [`진도: ${t.progress}`, `잘된 점: ${t.good}`, `다음 과제: ${t.next}`].join("\n");
}

// D2: 정규식(1차)에 안 걸린 메모를 AI가 한 번 더 본다. 분류만 남기고 문장은 저장하지 않는다.
export const HEALTH_CATEGORIES = ["부상", "질환", "약", "정신건강", "임신", "장애", "기타"] as const;
export const HEALTH_TOOL = "classify_health_info";
export const HEALTH_SYSTEM =
  "다음 메모에 건강 정보(부상·질환·통증·복용 약·정신건강·임신·장애 등 몸 상태)가 들어 있는지 판단한다. " +
  "스키 실력·자세·체력 수준·겁이 많음 같은 강습 관련 서술은 건강 정보가 아니다.";
export const HEALTH_SCHEMA = {
  type: "object",
  properties: {
    has_health_info: { type: "boolean" },
    categories: { type: "array", items: { type: "string", enum: [...HEALTH_CATEGORIES] } },
  },
  required: ["has_health_info", "categories"],
} as const;

export function parseHealth(input: unknown): string[] | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (typeof o.has_health_info !== "boolean") return null;
  if (!o.has_health_info) return [];
  const cats = Array.isArray(o.categories) ? o.categories.filter((c): c is string => (HEALTH_CATEGORIES as readonly string[]).includes(String(c))) : [];
  return (cats.length ? [...new Set(cats)] : ["기타"]).map((c) => `AI:${c}`);
}

// AI 2차 감지는 정규식이 못 찾았고 20자 이상일 때만 (비용·오탐 줄이기)
export function shouldAskHealthAi(text: string | null | undefined, regexHits: string[]) {
  return !!text && text.trim().length >= 20 && regexHits.length === 0;
}

// 이름·연락처는 지우되 건강 단어는 남긴다(판별해야 하므로)
export const healthPayload = (text: string, names: string[] = []) => redact(text, names, { maskHealth: false }).text;
