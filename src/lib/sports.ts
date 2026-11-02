// P17 종목: 스키 / 스노우보드 / 스노우스케이트. 종목 표는 DB(sports)가 기준이고, 여기는 이름 표기만 맞춘다.
export const SPORTS = ["스키", "스노우보드", "스노우스케이트"] as const;
export type SportName = (typeof SPORTS)[number];
export const SPORTS_LABEL = SPORTS.join("·");

// 띄어쓰기·대소문자를 지운 뒤 비교한다. 스케이트를 보드보다 먼저 본다.
const ALIASES: [SportName, RegExp][] = [
  ["스노우스케이트", /^(스노우?스케이트|snow?skate|스케이트)$/],
  ["스노우보드", /^(스노우?보드|보드|snowboard(ing)?)$/],
  ["스키", /^(스키|ski(ing)?)$/],
];

// 모델·CSV가 준 종목 값 → 샵이 쓰는 종목 이름 (없으면 null)
export function canonicalSport(raw: string | null | undefined, available: readonly string[]): string | null {
  if (!raw) return null;
  const s = raw.replace(/\s+/g, "").toLowerCase();
  if (available.includes(raw.trim())) return raw.trim();
  const hit = ALIASES.find(([, re]) => re.test(s))?.[0];
  return hit && available.includes(hit) ? hit : null;
}

// 접수 글에서 종목 찾기 (AI_MOCK·규칙 기반용). "스키장"은 종목이 아니다.
export function detectSport(text: string): SportName | null {
  const t = text.toLowerCase();
  if (/스노우?\s*스케이트|snow\s?skate/.test(t)) return "스노우스케이트";
  if (/보드|snowboard/.test(t)) return "스노우보드";
  if (/스키(?!장)|\bski/.test(t)) return "스키";
  return null;
}
