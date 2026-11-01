"use client";

import { useActionState, useState } from "react";
import { cancelMyLesson } from "./actions";

// 두 번 눌러야 취소된다. 24시간 안이면 3점, 그 전이면 1점 (supabase/migrations/*_cancel.sql)
export function CancelLesson({ jobId, within24h, back }: { jobId: string; within24h: boolean; back: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(cancelMyLesson, undefined);
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="mt-1 min-h-11 text-xs text-ink-muted underline">
        이 강습 취소
      </button>
    );
  }
  return (
    <form action={action} className="mt-2 flex flex-col gap-2 rounded-lg bg-red-50 p-3">
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="back" value={back} />
      <p className="text-xs text-[#7A1F1F]">
        강사 사정 취소는 정산에서 빠지고 패널티 <strong>{within24h ? 3 : 1}점</strong>이 기록됩니다
        {within24h ? " (강습 24시간 안)" : ""}.
      </p>
      <input name="reason" placeholder="사유" maxLength={200} className="min-h-11 rounded-lg border border-[#CBD3E1] bg-white px-3 text-sm" />
      <div className="flex gap-2">
        <button disabled={pending} className="min-h-11 flex-1 rounded-[10px] bg-danger text-sm font-medium text-white disabled:opacity-60">
          {pending ? "취소 중…" : "취소 확정"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="min-h-11 px-3 text-sm text-ink-muted">
          그만두기
        </button>
      </div>
      {state?.message && <p role="alert" className="text-xs text-danger">{state.message}</p>}
    </form>
  );
}
