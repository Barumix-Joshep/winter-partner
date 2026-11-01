"use client";

import { useActionState } from "react";
import { placeBid, type BidState } from "./actions";

export function BidForm({ jobId, ceiling, current }: { jobId: string; ceiling: number; current: { amount: number; memo: string | null } | null }) {
  const [state, action, pending] = useActionState<BidState | undefined, FormData>(placeBid, undefined);
  return (
    <form action={action} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="ceiling" value={ceiling} />
      <div className="flex gap-2">
        <input
          name="amount"
          inputMode="numeric"
          defaultValue={current?.amount ?? ceiling}
          aria-label="제시 금액"
          className="min-h-11 w-32 rounded-[10px] border border-line px-3 text-right text-sm"
        />
        <input name="memo" defaultValue={current?.memo ?? ""} placeholder="한마디 (선택)" maxLength={100} className="min-h-11 flex-1 rounded-[10px] border border-line px-3 text-sm" />
      </div>
      <button disabled={pending} className="min-h-11 rounded-[10px] bg-brand text-sm font-medium text-white disabled:opacity-60">
        {pending ? "보내는 중…" : current ? "금액 바꾸기" : "금액 제시"}
      </button>
      {state?.message && (
        <p role="status" className={`text-xs ${state.ok ? "text-brand" : "text-danger"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
