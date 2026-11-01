// 건강 정보(부상·질환) 감지. 받지 않는 것이 원칙이라 입력란에 안내하고, 저장할 때 걸리면 경고한다(저장은 막지 않는다).
// 메모 원문은 경고 기록에 남기지 않고, 걸린 단어만 남긴다.
export const HEALTH_HINT = "부상·질환 등 건강 정보는 적지 마세요.";

const TERMS = [
  "부상", "골절", "염좌", "인대", "연골", "탈구", "수술", "깁스", "디스크", "통증", "타박상",
  "질환", "질병", "병력", "지병", "진단", "치료 중", "치료중", "입원", "약 복용", "복용 중", "복용중",
  "당뇨", "천식", "심장", "혈압", "뇌전증", "간질", "발작", "알레르기", "알러지", "아토피",
  "임신", "장애", "adhd", "자폐", "공황", "우울",
] as const;

export function detectHealthTerms(text: string | null | undefined): string[] {
  if (!text) return [];
  const t = text.toLowerCase();
  return [...new Set(TERMS.filter((w) => t.includes(w)))];
}

export function healthWarning(terms: string[]) {
  return `건강 정보로 보이는 단어(${terms.join(", ")})가 있습니다. 저장은 했지만, 꼭 필요한 경우가 아니면 지워 주세요.`;
}
