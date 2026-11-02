// A3 입찰 선정 보조: 입찰별 재료를 "강사1·팀1"처럼 이름 없이 보내 추천과 이유를 받는다. 선정은 사장님이.
import { redact } from "./redact";

export type BidContext = {
  bid_id: string;
  bidder_type: "instructor" | "shop";
  amount: number;
  memo: string | null;
  rating: number | null;
  lessons: number;
  certs: string[];
  penalty: number;
  with_shop: number;
};
export type JobCondition = { lessonLabel: string; studentCount: number; levels: string[]; note: string | null; ceiling: number | null; sport: string | null; customerNames?: string[] };

export type BidAssist = { recommended: string; reasons: string[]; notes: Record<string, string>; flags: Record<string, string[]> };

export const BID_TOOL = "recommend_bid";
export const BID_SYSTEM =
  "너는 스키·스노우보드·스노우스케이트 렌탈샵 사장님이 강습 입찰 중 하나를 고르도록 돕는다. 추천은 참고일 뿐 결정은 사장님이 한다. " +
  "금액만으로 고르지 말고 평점·강습 경험·검증 자격증·패널티·이 샵과 함께한 경험·한마디가 강습 조건(레벨·인원·어린이 여부)에 맞는지 함께 본다. " +
  "각 입찰의 장단점을 한 줄로, 추천 이유를 두 줄로 쓴다. 한마디가 조건과 맞지 않거나 수상하면 flags에 적는다. 존댓말로 짧게.";
export const BID_SCHEMA = {
  type: "object",
  properties: {
    recommended: { type: "string", description: "추천 입찰 표시(예: 강사1, 팀1)" },
    reasons: { type: "array", items: { type: "string" }, maxItems: 2 },
    bids: { type: "array", items: { type: "object", properties: { label: { type: "string" }, note: { type: "string" } }, required: ["label", "note"] } },
    flags: { type: "array", items: { type: "object", properties: { label: { type: "string" }, flag: { type: "string" } }, required: ["label", "flag"] } },
  },
  required: ["recommended", "reasons", "bids", "flags"],
} as const;

// 입찰 표시: 강사는 강사1·2…, 팀은 팀1·2… (금액순)
export function labelBids(bids: BidContext[]) {
  let i = 0;
  let t = 0;
  return bids.map((b) => ({ ...b, label: b.bidder_type === "shop" ? `팀${++t}` : `강사${++i}` }));
}

export function bidPrompt(job: JobCondition, bids: BidContext[]) {
  const labeled = labelBids(bids);
  const names = job.customerNames ?? []; // 이 강습 손님 이름 → 손님A
  const lines = labeled.map((b) =>
    [
      `- ${b.label}: ${b.amount.toLocaleString("ko-KR")}원`,
      b.bidder_type === "shop" ? "강습팀" : `평점 ${b.rating ?? "없음"}, 자격 ${b.certs.join("·") || "검증 없음"}, 패널티 ${b.penalty}점`,
      `완료 강습 ${b.lessons}회, 이 샵과 ${b.with_shop}회`,
      b.memo ? `한마디 "${redact(b.memo, names).text}"` : "한마디 없음",
    ].join(" · "),
  );
  const cond = [
    `강습: ${job.sport ?? ""} ${job.lessonLabel}, ${job.studentCount}명`,
    `손님 레벨: ${job.levels.join(", ") || "모름"}`,
    job.note ? `요청 사항: ${redact(job.note, names).text}` : null,
    job.ceiling ? `상한 ${job.ceiling.toLocaleString("ko-KR")}원` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return { text: `${cond}\n\n입찰:\n${lines.join("\n")}`, labels: new Map(labeled.map((b) => [b.label, b.bid_id])) };
}

// 규칙 경고 (AI 없이도 계산): 상한의 50% 미만, 패널티 3점 이상, 검증 자격증 없음
export function ruleFlags(bids: BidContext[], ceiling: number | null) {
  const out: Record<string, string[]> = {};
  for (const b of bids) {
    const f: string[] = [];
    if (ceiling && b.amount < ceiling * 0.5) f.push("상한의 절반 미만 금액");
    if (b.penalty >= 3) f.push(`패널티 ${b.penalty}점`);
    if (b.bidder_type === "instructor" && b.certs.length === 0) f.push("검증된 자격증 없음");
    if (f.length) out[b.bid_id] = f;
  }
  return out;
}

export function parseBidAssist(input: unknown, labels: Map<string, string>): BidAssist | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const rec = typeof o.recommended === "string" ? labels.get(o.recommended.trim()) : undefined;
  if (!rec) return null;
  const reasons = Array.isArray(o.reasons) ? o.reasons.filter((r): r is string => typeof r === "string").map((r) => r.slice(0, 120)).slice(0, 2) : [];
  const notes: Record<string, string> = {};
  for (const b of Array.isArray(o.bids) ? o.bids : []) {
    const id = b && typeof b === "object" ? labels.get(String((b as { label?: unknown }).label ?? "")) : undefined;
    const note = b && typeof b === "object" ? (b as { note?: unknown }).note : undefined;
    if (id && typeof note === "string") notes[id] = note.slice(0, 120);
  }
  const flags: Record<string, string[]> = {};
  for (const f of Array.isArray(o.flags) ? o.flags : []) {
    const id = f && typeof f === "object" ? labels.get(String((f as { label?: unknown }).label ?? "")) : undefined;
    const flag = f && typeof f === "object" ? (f as { flag?: unknown }).flag : undefined;
    if (id && typeof flag === "string") (flags[id] ??= []).push(flag.slice(0, 80));
  }
  return { recommended: rec, reasons, notes, flags };
}
