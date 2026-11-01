// 폼 값 읽기 공통

export function text(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

// 체크박스 여러 개 → 양의 정수 배열. 하나라도 잘못되면 null
export function ids(fd: FormData, key: string): number[] | null {
  const out = fd.getAll(key).map((v) => Number(v));
  return out.every((n) => Number.isInteger(n) && n > 0) ? out : null;
}
