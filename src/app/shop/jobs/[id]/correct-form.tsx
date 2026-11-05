"use client";

import { useActionState } from "react";
import { correctLesson } from "./actions";

// 승인된 강습 정정 (P19-2): 시간·강사 지급액. 사유와 이력이 남고, 발행된 정산서에 든 강습은 고칠 수 없다.
export function CorrectForm({ jobId, date, start, end, rate }: { jobId: string; date: string; start: string; end: string; rate: number }) {
  const [state, action, pending] = useActionState(correctLesson, undefined);
  const input = "min-h-11 rounded-lg border border-[#CBD3E1] bg-white px-3 text-sm text-ink";
  return (
    <details className="mt-3 rounded-lg border border-line p-3">
      <summary className="cursor-pointer text-sm font-medium">승인된 강습 정정</summary>
      <p className="mt-2 text-xs text-ink-muted">
        시간이나 금액이 잘못 승인됐을 때만 씁니다. 사유와 이전 값이 기록되고, 이미 발행한 정산서에 들어간 강습은 고칠 수 없습니다(다음 달 정산에서 조정).
      </p>
      <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
        <input type="hidden" name="job_id" value={jobId} />
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          날짜
          <input type="date" name="date" defaultValue={date} required className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          시작
          <input type="time" name="start" defaultValue={start} required className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          끝
          <input type="time" name="end" defaultValue={end} required className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          강사 지급액
          <input name="final_rate" inputMode="numeric" defaultValue={rate} required className={`${input} w-32`} />
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-ink-muted">
          정정 사유
          <input name="reason" required maxLength={200} placeholder="예: 1시간 연장" className={input} />
        </label>
        <button disabled={pending} className="min-h-11 rounded-[10px] border border-brand px-4 text-sm font-medium text-brand disabled:opacity-60">
          {pending ? "정정 중…" : "정정"}
        </button>
        {state?.message && (
          <p role={state.ok ? "status" : "alert"} className={`w-full text-xs ${state.ok ? "text-[#1E7B34]" : "text-danger"}`}>
            {state.message}
          </p>
        )}
      </form>
    </details>
  );
}
