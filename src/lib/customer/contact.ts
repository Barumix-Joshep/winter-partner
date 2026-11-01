// 손님 연락 기록 (샵 관리자만). 다음 연락일을 비우면 '오늘 연락할 손님'에서 빠진다.
export const CONTACT_CHANNELS = { phone: "전화", message: "문자", visit: "방문", other: "기타" } as const;
export type ContactChannel = keyof typeof CONTACT_CHANNELS;

export type ContactInput = { channel: ContactChannel; memo: string | null; nextOn: string | null; nextNote: string | null };

const text = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

export function parseContact(fd: FormData): { ok: true; data: ContactInput } | { ok: false; message: string } {
  const channel = text(fd, "channel");
  if (!(channel in CONTACT_CHANNELS)) return { ok: false, message: "연락 방법을 골라 주세요." };
  const memo = text(fd, "memo");
  if (memo.length > 500) return { ok: false, message: "메모는 500자까지입니다." };
  const nextOn = text(fd, "next_on");
  if (nextOn && !/^\d{4}-\d{2}-\d{2}$/.test(nextOn)) return { ok: false, message: "다음 연락일을 확인해 주세요." };
  const nextNote = text(fd, "next_note").slice(0, 100);
  return { ok: true, data: { channel: channel as ContactChannel, memo: memo || null, nextOn: nextOn || null, nextNote: nextOn ? nextNote || null : null } };
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
// "2026-11-20" → "11/20(금)"
export function formatDay(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAY[d.getUTCDay()]})`;
}
