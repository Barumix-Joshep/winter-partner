// 입찰 공고·입찰 입력 처리 (한국 시간 기준)

const KST = 9 * 3600_000;

// <input type="datetime-local"> 값 "2027-01-08T18:00" → "2027-01-08T18:00:00+09:00"
export function parseKstLocal(v: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? `${v}:00+09:00` : null;
}

// ISO 시각 → datetime-local 값 (한국 시간)
export function kstLocalInput(iso: string) {
  return new Date(new Date(iso).getTime() + KST).toISOString().slice(0, 16);
}

// 기본 마감: 강습 전날 18:00
export function defaultBidClose(startsAt: string) {
  const day = new Date(new Date(startsAt).getTime() + KST - 86400_000).toISOString().slice(0, 10);
  return `${day}T18:00`;
}

export function parseBidAmount(raw: string, ceiling: number): { ok: true; amount: number } | { ok: false; message: string } {
  const s = raw.replace(/,/g, "").trim();
  if (!/^\d+$/.test(s) || Number(s) <= 0) return { ok: false, message: "금액을 숫자로 입력해 주세요." };
  const amount = Number(s);
  if (amount > ceiling) return { ok: false, message: `상한가 ${ceiling.toLocaleString("ko-KR")}원 이하로 제시해 주세요.` };
  return { ok: true, amount };
}
