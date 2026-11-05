// 목록 쪽 나누기 (P19-3). PostgREST는 한 번에 최대 1000행이라, 넘으면 잘린 줄 모르고 보이던 문제를 막는다.
export function parsePage(raw: unknown) {
  const n = typeof raw === "string" ? Number(raw) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

// supabase .range(from, to)용 (to 포함)
export function pageRange(page: number, size: number): [number, number] {
  return [(page - 1) * size, page * size - 1];
}

// "전체 N건 중 a~b", 이전·다음 쪽 번호
export function pageInfo(page: number, size: number, total: number) {
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(page, pages);
  const from = total === 0 ? 0 : (p - 1) * size + 1;
  const to = Math.min(p * size, total);
  return { page: p, pages, from, to, total, prev: p > 1 ? p - 1 : null, next: p < pages ? p + 1 : null, truncated: pages > 1 };
}
