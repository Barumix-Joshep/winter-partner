"use client";

import { useActionState, useState } from "react";
import { cancelJob } from "./actions";

export function CancelForm({ jobId, assigned }: { jobId: string; assigned: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(cancelJob, undefined);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="min-h-11 self-start px-1 text-sm text-danger">
        강습 취소…
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3 rounded-[14px] border border-red-200 bg-red-50 p-4">
      <input type="hidden" name="job_id" value={jobId} />
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" name="by" value="customer" defaultChecked className="size-4" /> 손님 취소
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" name="by" value="shop" className="size-4" /> 샵 사정
        </label>
      </fieldset>
      <input name="reason" placeholder="사유 (선택)" maxLength={200} className="min-h-11 rounded-lg border border-[#CBD3E1] bg-white px-3 text-sm" />
      <p className="text-xs text-[#7A1F1F]">
        {assigned ? "배정된 강사에게 바로 알림이 가고, " : ""}이 강습은 정산에서 빠집니다. 되돌릴 수 없습니다.
      </p>
      <div className="flex gap-2">
        <button disabled={pending} className="min-h-11 rounded-[10px] bg-danger px-4 text-sm font-medium text-white disabled:opacity-60">
          {pending ? "취소 중…" : "강습 취소"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-3 text-sm text-ink-muted">
          닫기
        </button>
      </div>
      {state?.message && <p role="alert" className="text-xs text-danger">{state.message}</p>}
    </form>
  );
}
