// 강사 찾기 검색 조건 (URL 쿼리 → 검색 인자)

// 시간대는 이어 붙어 있다 (강사 가능 시간을 합쳐 저장할 수 있게)
export const SLOTS = {
  am: { label: "오전", from: "09:00", to: "13:00" },
  pm: { label: "오후", from: "13:00", to: "18:00" },
  night: { label: "야간", from: "18:00", to: "22:00" },
} as const;
export type Slot = keyof typeof SLOTS;

function isDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function slotRange(date: string, slot: string) {
  if (!isDate(date) || !(slot in SLOTS)) return null;
  const s = SLOTS[slot as Slot];
  return { from: `${date}T${s.from}:00+09:00`, to: `${date}T${s.to}:00+09:00` };
}

type Query = Record<string, string | string[] | undefined>;
const one = (q: Query, k: string) => {
  const v = q[k];
  return (Array.isArray(v) ? v[0] : v) ?? "";
};

export function parseSearch(q: Query, shopResortIds: number[]) {
  const resort = Number(one(q, "resort"));
  const sport = Number(one(q, "sport"));
  const date = isDate(one(q, "date")) ? one(q, "date") : "";
  const slot = (one(q, "slot") in SLOTS ? one(q, "slot") : "am") as Slot;
  return {
    resortId: shopResortIds.includes(resort) ? resort : (shopResortIds[0] ?? null),
    sportId: Number.isInteger(sport) && sport > 0 ? sport : null,
    date,
    slot,
    range: slotRange(date, slot),
  };
}
