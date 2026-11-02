"use client";

import { useActionState } from "react";
import { summarizeActivity, type ActivityState } from "./actions";

export function ActivityButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActivityState | undefined, FormData>(summarizeActivity, undefined);
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="id" value={id} />
      <button disabled={pending} className="min-h-11 self-start px-1 text-xs text-brand underline disabled:opacity-60">
        {pending ? "요약 중…" : "최근 활동 요약 (AI)"}
      </button>
      {state?.summary && <p role="status" className="text-xs text-[#35466A]">{state.summary}</p>}
      {state?.message && <p className="text-xs text-danger">{state.message}</p>}
    </form>
  );
}
