"use client";

import { useActionState } from "react";
import { assignMember, placeTeamBid, type TeamState } from "./actions";

const input = "min-h-11 rounded-[10px] border border-line bg-white px-3 text-sm";

export function TeamBidForm({ jobId, ceiling, current }: { jobId: string; ceiling: number; current: { amount: number; memo: string | null } | null }) {
  const [state, action, pending] = useActionState<TeamState | undefined, FormData>(placeTeamBid, undefined);
  return (
    <form action={action} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="ceiling" value={ceiling} />
      <div className="flex flex-wrap gap-2">
        <input name="amount" inputMode="numeric" defaultValue={current?.amount ?? ceiling} aria-label="팀 제시 금액" className={`${input} w-36 text-right`} />
        <input name="memo" defaultValue={current?.memo ?? ""} placeholder="한마디 (선택)" maxLength={100} className={`${input} min-w-0 flex-1`} />
        <button disabled={pending} className="min-h-11 rounded-[10px] bg-brand px-4 text-sm font-medium text-white disabled:opacity-60">
          {pending ? "보내는 중…" : current ? "금액 바꾸기" : "팀으로 입찰"}
        </button>
      </div>
      {state?.message && (
        <p role="status" className={`text-xs ${state.ok ? "text-brand" : "text-danger"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}

export function AssignMemberForm({ jobId, members, current }: { jobId: string; members: { id: string; name: string }[]; current: string | null }) {
  const [state, action, pending] = useActionState<TeamState | undefined, FormData>(assignMember, undefined);
  return (
    <form action={action} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="job_id" value={jobId} />
      <div className="flex flex-wrap gap-2">
        <select name="instructor_id" defaultValue={current ?? ""} required aria-label="맡을 팀원" className={`${input} min-w-0 flex-1`}>
          <option value="" disabled>
            팀원 고르기
          </option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <button disabled={pending || members.length === 0} className="min-h-11 rounded-[10px] border-[1.5px] border-brand bg-white px-4 text-sm font-medium text-brand disabled:opacity-50">
          {pending ? "지정 중…" : current ? "팀원 바꾸기" : "팀원 지정"}
        </button>
      </div>
      {state?.message && (
        <p role="status" className={`text-xs ${state.ok ? "text-brand" : "text-danger"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
