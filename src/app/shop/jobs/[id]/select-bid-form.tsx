"use client";

import { useActionState } from "react";
import { selectBid } from "./actions";

// 입찰 금액을 그대로 쓰거나 조정해 확정한다
export function SelectBidForm({ jobId, bidId, amount }: { jobId: string; bidId: string; amount: number }) {
  const [state, action, pending] = useActionState(selectBid, undefined);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="bid_id" value={bidId} />
      <div className="flex items-center gap-2">
        <input
          name="final_rate"
          inputMode="numeric"
          defaultValue={amount}
          aria-label="확정 금액"
          className="min-h-10 w-28 rounded-lg border border-[#CBD3E1] px-2 text-right text-sm"
        />
        <button disabled={pending} className="min-h-10 rounded-lg border-[1.5px] border-brand bg-white px-3.5 text-[13px] font-medium text-brand disabled:opacity-60">
          {pending ? "확정 중…" : "선정"}
        </button>
      </div>
      {state?.message && <p role="alert" className="max-w-56 text-right text-xs text-danger">{state.message}</p>}
    </form>
  );
}
