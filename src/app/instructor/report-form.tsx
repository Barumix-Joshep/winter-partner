"use client";

import { useActionState } from "react";
import { completeLesson } from "./actions";

export function ReportForm({ jobId }: { jobId: string }) {
  const [state, action, pending] = useActionState(completeLesson, undefined);
  return (
    <form action={action} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="job_id" value={jobId} />
      <textarea
        name="note"
        rows={2}
        maxLength={1000}
        placeholder="강습 노트 (다음 강습 참고): 어디까지 했는지, 다음에 할 것"
        aria-describedby={`note-hint-${jobId}`}
        className="rounded-[10px] border border-line px-3 py-2 text-sm"
      />
      <p id={`note-hint-${jobId}`} className="text-xs text-ink-muted">
        같은 샵에서 다음에 맡는 강사가 봅니다. 부상·질환 등 건강 정보는 적지 마세요.
      </p>
      <button disabled={pending} className="min-h-11 rounded-[10px] bg-brand text-sm font-medium text-white disabled:opacity-60">
        {pending ? "보내는 중…" : "완료 보고하기"}
      </button>
      {state?.message && <p role="alert" className="text-xs text-danger">{state.message}</p>}
    </form>
  );
}
