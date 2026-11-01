"use client";

import { useActionState, useState } from "react";
import { saveWeek, type ScheduleState } from "./actions";
import { SLOTS, type Slot } from "@/lib/shop/search";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

type Props = { week: string; days: string[]; today: string; initial: string[]; busy: string[] };

// 7일 × 오전·오후·야간. 확정 강습이 있는 칸은 잠근다. 지난 날은 바꿀 수 없다.
export function WeekGrid({ week, days, today, initial, busy }: Props) {
  const [state, action, pending] = useActionState<ScheduleState | undefined, FormData>(saveWeek, undefined);
  const [on, setOn] = useState(() => new Set(initial));
  const busySet = new Set(busy);
  const toggle = (k: string) =>
    setOn((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="week" value={week} />
      {[...on].map((k) => (
        <input key={k} type="hidden" name="cells" value={k} />
      ))}
      <div className="grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))] gap-1 rounded-[14px] border border-line bg-white p-2 text-center">
        <span />
        {days.map((d, i) => (
          <span key={d} className={`pb-1 text-[11px] ${d === today ? "font-bold text-brand" : "text-ink-muted"}`}>
            {WEEKDAY[i]}
            <br />
            {Number(d.slice(8))}
          </span>
        ))}
        {(Object.keys(SLOTS) as Slot[]).map((slot) => (
          <div key={slot} className="contents">
            <span className="flex flex-col justify-center text-left text-[11px] leading-tight">
              <strong className="text-xs">{SLOTS[slot].label}</strong>
              <span className="text-ink-muted">{SLOTS[slot].from.slice(0, 2)}~{SLOTS[slot].to.slice(0, 2)}</span>
            </span>
            {days.map((d) => {
              const k = `${d}:${slot}`;
              const isBusy = busySet.has(k);
              const past = d < today;
              const active = on.has(k);
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={isBusy || active}
                  aria-label={`${d} ${SLOTS[slot].label} ${isBusy ? "강습" : active ? "가능" : "미등록"}`}
                  disabled={isBusy || past}
                  onClick={() => toggle(k)}
                  className={`min-h-11 rounded-lg text-[11px] font-medium ${
                    isBusy
                      ? "bg-[#E3EBFF] text-brand"
                      : active
                        ? "bg-[#E6F4EA] text-[#1B6B3A]"
                        : "bg-surface text-[#9AA7BE]"
                  } ${past ? "opacity-40" : ""}`}
                >
                  {isBusy ? "강습" : active ? "가능" : "–"}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <p className="rounded-xl bg-[#E3EBFF] p-3 text-xs leading-5 text-brand-dark">
        가능 시간을 등록해 두면 샵의 강사 찾기와 직접 의뢰에 그 시간이 잡힙니다. 다른 샵 강습과 겹치는 시간은 자동으로 막힙니다.
      </p>
      <button disabled={pending} className="min-h-12 rounded-xl bg-brand text-[15px] font-bold text-white disabled:opacity-60">
        {pending ? "저장 중…" : "이번 주 가능 시간 저장"}
      </button>
      {state?.message && (
        <p role="status" className={`text-center text-sm ${state.ok ? "text-brand" : "text-danger"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
