"use client";

import { useActionState } from "react";
import { approveLesson } from "./actions";

export function ApproveForm({ jobId }: { jobId: string }) {
  const [state, action, pending] = useActionState(approveLesson, undefined);
  return (
    <form action={action} className="mt-3 flex flex-wrap items-end gap-2">
      <input type="hidden" name="job_id" value={jobId} />
      <label className="flex flex-col gap-1 text-xs text-ink-muted">
        강사 평가 (선택)
        <select name="score" defaultValue="" className="min-h-11 rounded-lg border border-[#CBD3E1] bg-white px-3 text-sm text-ink">
          <option value="">평가 안 함</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n}점
            </option>
          ))}
        </select>
      </label>
      <input name="memo" placeholder="한마디 (선택)" maxLength={300} className="min-h-11 flex-1 rounded-lg border border-[#CBD3E1] px-3 text-sm" />
      <button disabled={pending} className="min-h-11 rounded-[10px] bg-brand px-5 text-sm font-medium text-white disabled:opacity-60">
        {pending ? "승인 중…" : "승인"}
      </button>
      {state?.message && <p role="alert" className="w-full text-xs text-danger">{state.message}</p>}
    </form>
  );
}
