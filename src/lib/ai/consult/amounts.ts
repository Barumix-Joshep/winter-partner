// 답변 속 금액이 안내 정보에 있는 금액인지 대조한다 (AI가 금액을 지어내면 사람에게 넘긴다).
// 인식하는 형태: 120,000원 · 120000원 · ₩120,000 · 12만원 · 12만 원 · 3만5천원 · 1.5만원
const WON = /(?:₩\s*(\d{1,3}(?:,\d{3})+|\d+))|(\d+(?:\.\d+)?)\s*만\s*(?:(\d+)\s*천)?\s*원|(\d{1,3}(?:,\d{3})+|\d+)\s*원/g;

export function extractAmounts(text: string): number[] {
  const out: number[] = [];
  for (const m of (text ?? "").matchAll(WON)) {
    if (m[1]) out.push(Number(m[1].replace(/,/g, "")));
    else if (m[2]) out.push(Math.round(Number(m[2]) * 10000 + (m[3] ? Number(m[3]) * 1000 : 0)));
    else if (m[4]) out.push(Number(m[4].replace(/,/g, "")));
  }
  return out.filter((n) => Number.isFinite(n) && n > 0);
}

// 답변 금액이 모두 안내 정보에 있으면 null, 아니면 없는 금액 목록
export function unknownAmounts(reply: string, kbTexts: string[]): number[] | null {
  const known = new Set(kbTexts.flatMap(extractAmounts));
  const missing = extractAmounts(reply).filter((n) => !known.has(n));
  return missing.length ? missing : null;
}
