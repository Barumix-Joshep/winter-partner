"use client";

import { useActionState } from "react";
import { publishBid } from "./actions";

export function PublishForm({ jobId, defaultClose, ceiling }: { jobId: string; defaultClose: string; ceiling: number | null }) {
  const [state, action, pending] = useActionState(publishBid, undefined);
  return (
    <form action={action} className="flex flex-col gap-3 rounded-[14px] border border-line bg-white p-4">
      <input type="hidden" name="job_id" value={jobId} />
      <p className="text-sm text-ink-muted">
        전속이 아닌 프리랜서에게 공개됩니다. 상한가는 강사 지급액
        {ceiling != null ? ` ${ceiling.toLocaleString("ko-KR")}원` : "(먼저 정해야 합니다)"}입니다.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-xs text-ink-muted">
          마감
          <input type="datetime-local" name="closes_at" defaultValue={defaultClose} className="min-h-11 rounded-lg border border-[#CBD3E1] px-3 text-sm text-ink" />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="allow_team" className="size-4" /> 강습팀 입찰도 받기
        </label>
        <button disabled={pending || ceiling == null} className="min-h-11 rounded-[10px] bg-brand px-5 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "올리는 중…" : "입찰 공고 올리기"}
        </button>
      </div>
      {state?.message && <p role="alert" className="text-sm text-danger">{state.message}</p>}
    </form>
  );
}
