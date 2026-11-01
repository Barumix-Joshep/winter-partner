// 14세 미만 판단 (DB private.is_minor와 같은 규칙). 출생 연도만으로는 생일 전후를 알 수 없어
// 올해 기준 14살 이하면 14세 미만으로 본다(보수적으로).
export function isMinor(birthYear: number | null | undefined, nowYear: number) {
  return birthYear != null && nowYear - birthYear <= 14;
}

export function kstYear(now: number) {
  return new Date(now + 9 * 3600_000).getUTCFullYear();
}

// "2015" → 2015, "" → null, 잘못된 값 → undefined
export function parseBirthYear(raw: string, nowYear: number): number | null | undefined {
  const v = raw.trim();
  if (!v) return null;
  if (!/^\d{4}$/.test(v)) return undefined;
  const y = Number(v);
  return y >= nowYear - 100 && y <= nowYear ? y : undefined;
}
