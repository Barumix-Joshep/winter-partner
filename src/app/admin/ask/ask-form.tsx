"use client";

import { useActionState } from "react";
import { ask, type AskState } from "./actions";
import { METRICS } from "@/lib/ai/admin-query";

const input = "min-h-11 rounded-lg border border-[#CBD3E1] bg-white px-3 text-sm";

export function AskForm({ ai, month }: { ai: boolean; month: string }) {
  const [state, action, pending] = useActionState<AskState | undefined, FormData>(ask, undefined);
  return (
    <div className="flex flex-col gap-4">
      {ai && (
        <form action={action} className="flex flex-wrap gap-2 rounded-[14px] border border-[#BFD0F7] bg-[#F3F6FF] p-4">
          <input name="question" aria-label="질문" placeholder="예: 이번 달 샵별 강습 수는?" className={`${input} min-w-0 flex-1`} />
          <button disabled={pending} className="min-h-11 rounded-[10px] bg-brand px-4 text-sm font-medium text-white disabled:opacity-60">
            {pending ? "찾는 중…" : "묻기"}
          </button>
          <p className="w-full text-xs text-ink-muted">AI는 아래 집계 중 하나를 고르기만 합니다(데이터를 직접 조회하지 않음).</p>
        </form>
      )}
      <form action={action} className="flex flex-wrap items-end gap-2 rounded-[14px] border border-line bg-white p-4">
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          집계
          <select name="metric" aria-label="집계" className={input}>
            {Object.entries(METRICS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          월
          <input name="month" type="month" defaultValue={month} aria-label="월" className={input} />
        </label>
        <button disabled={pending} className="min-h-11 rounded-[10px] border-[1.5px] border-brand px-4 text-sm font-medium text-brand disabled:opacity-60">
          보기
        </button>
      </form>
      {state?.message && <p className="text-sm text-danger">{state.message}</p>}
      {state?.rows && state.metric && (
        <section role="status" className="rounded-[14px] border border-line bg-white p-4">
          <h2 className="text-sm font-bold">
            {METRICS[state.metric]} · {state.month}
          </h2>
          {state.rows.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">데이터가 없습니다.</p>
          ) : (
            <table className="mt-2 w-full text-sm">
              <tbody>
                {state.rows.map((r) => (
                  <tr key={r.label} className="border-t border-[#EEF1F6]">
                    <td className="py-1.5">{r.label}</td>
                    <td className="py-1.5 text-right font-medium">{r.value.toLocaleString("ko-KR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
