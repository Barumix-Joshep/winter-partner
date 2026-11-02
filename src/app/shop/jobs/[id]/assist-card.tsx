"use client";

import { useActionState } from "react";
import { assistBids, type AssistState } from "./assist-action";

// 입찰 선정 보조 카드 (AI 켜졌을 때만). 추천대로 선택은 그 입찰의 선정 버튼으로 옮겨 줄 뿐, 확정은 사장님이 누른다.
export function AssistCard({ jobId, names }: { jobId: string; names: Record<string, string> }) {
  const [state, action, pending] = useActionState<AssistState | undefined, FormData>(assistBids, undefined);
  const pick = () => {
    const el = state?.recommended ? document.getElementById(`select-bid-${state.recommended}`) : null;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus();
  };
  return (
    <div className="mt-3 rounded-[10px] border border-[#BFD0F7] bg-[#F3F6FF] p-3">
      <form action={action} className="flex flex-wrap items-center justify-between gap-2">
        <input type="hidden" name="job_id" value={jobId} />
        <p className="text-xs text-[#35466A]">평점·경험·자격·패널티·이 샵과의 강습을 함께 비교해 추천합니다. 이름은 보내지 않습니다.</p>
        <button disabled={pending} className="min-h-11 rounded-[10px] bg-brand px-4 text-sm font-medium text-white disabled:opacity-60">
          {pending ? "비교 중…" : state?.recommended ? "다시 추천" : "AI 추천 보기"}
        </button>
      </form>
      {state?.message && <p className="mt-2 text-xs text-danger">{state.message}</p>}
      {state?.recommended && (
        <div role="status" className="mt-3 flex flex-col gap-2 text-sm">
          <p>
            추천: <strong>{names[state.recommended] ?? "입찰"}</strong>
          </p>
          <ul className="text-xs text-[#35466A]">
            {(state.reasons ?? []).map((r, i) => (
              <li key={i} className="ml-4 list-disc">
                {r}
              </li>
            ))}
          </ul>
          <button type="button" onClick={pick} className="min-h-11 self-start rounded-[10px] border-[1.5px] border-brand bg-white px-4 text-sm font-medium text-brand">
            추천대로 선택
          </button>
        </div>
      )}
      {state && (state.notes || state.flags) && (
        <ul className="mt-2 flex flex-col gap-1 text-xs">
          {Object.keys(names).map((id) =>
            state.notes?.[id] || state.flags?.[id]?.length ? (
              <li key={id}>
                <strong>{names[id]}</strong> {state.notes?.[id] ? `· ${state.notes[id]}` : ""}
                {(state.flags?.[id] ?? []).map((f) => (
                  <span key={f} className="ml-1 rounded-full bg-[#FFF1E0] px-2 py-0.5 text-[11px] text-[#B4560A]">
                    {f}
                  </span>
                ))}
              </li>
            ) : null,
          )}
        </ul>
      )}
    </div>
  );
}
