// 강사 가능 일정 (주간). 날짜는 한국 날짜 "YYYY-MM-DD", 칸은 "날짜:시간대".
import { SLOTS, type Slot } from "@/lib/shop/search";

const KST = 9 * 3600_000;
const DAY = 86400_000;
const SLOT_ORDER: Slot[] = ["am", "pm", "night"];

const utcDate = (d: string) => new Date(`${d}T00:00:00Z`);
const fmt = (t: Date) => t.toISOString().slice(0, 10);

export function todayKst(now: number) {
  return fmt(new Date(now + KST));
}

export function weekStartOf(date: string) {
  const d = utcDate(date);
  return fmt(new Date(d.getTime() - d.getUTCDay() * DAY));
}

export function weekDays(start: string) {
  const s = utcDate(start).getTime();
  return Array.from({ length: 7 }, (_, i) => fmt(new Date(s + i * DAY)));
}

export function cellKey(date: string, slot: Slot) {
  return `${date}:${slot}`;
}

function parseCell(key: string): { date: string; slot: Slot } | null {
  const [date, slot] = key.split(":");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !(slot in SLOTS)) return null;
  return { date, slot: slot as Slot };
}

const iso = (date: string, hm: string) => `${date}T${hm}:00+09:00`;

// 고른 칸 → 가능 시간 범위 (같은 날 붙어 있는 시간대는 합친다)
export function rangesFromCells(keys: string[]) {
  const byDay = new Map<string, Set<Slot>>();
  for (const k of keys) {
    const c = parseCell(k);
    if (!c) continue;
    if (!byDay.has(c.date)) byDay.set(c.date, new Set());
    byDay.get(c.date)!.add(c.slot);
  }
  const out: { starts: string; ends: string }[] = [];
  for (const date of [...byDay.keys()].sort()) {
    let cur: { starts: string; ends: string } | null = null;
    for (const slot of SLOT_ORDER) {
      if (!byDay.get(date)!.has(slot)) {
        cur = null;
        continue;
      }
      const s = SLOTS[slot];
      if (cur && cur.ends === iso(date, s.from)) cur.ends = iso(date, s.to);
      else out.push((cur = { starts: iso(date, s.from), ends: iso(date, s.to) }));
    }
  }
  return out;
}

// 저장된 범위(또는 확정 강습)가 칸 전체를 덮으면 그 칸
export function coveredCells(ranges: { starts_at: string; ends_at: string }[], days: string[]) {
  const out = new Set<string>();
  for (const date of days) {
    for (const slot of SLOT_ORDER) {
      const from = new Date(iso(date, SLOTS[slot].from)).getTime();
      const to = new Date(iso(date, SLOTS[slot].to)).getTime();
      if (ranges.some((r) => new Date(r.starts_at).getTime() <= from && new Date(r.ends_at).getTime() >= to)) {
        out.add(cellKey(date, slot));
      }
    }
  }
  return out;
}

// 칸과 조금이라도 겹치는 확정 강습 (그 칸은 잠근다)
export function busyCells(jobs: { starts_at: string; ends_at: string }[], days: string[]) {
  const out = new Set<string>();
  for (const date of days) {
    for (const slot of SLOT_ORDER) {
      const from = new Date(iso(date, SLOTS[slot].from)).getTime();
      const to = new Date(iso(date, SLOTS[slot].to)).getTime();
      if (jobs.some((j) => new Date(j.starts_at).getTime() < to && new Date(j.ends_at).getTime() > from)) out.add(cellKey(date, slot));
    }
  }
  return out;
}

export function weekWindow(start: string) {
  const days = weekDays(start);
  return { from: `${days[0]}T00:00:00+09:00`, to: `${fmt(new Date(utcDate(days[6]).getTime() + DAY))}T00:00:00+09:00` };
}
