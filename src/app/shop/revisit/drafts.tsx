"use client";

import { useActionState } from "react";
import { draftRevisit, type RevisitState } from "./actions";

type Row = { customer_id: string; name: string; level: string | null; lessons: number; last_lesson: string | null; sport: string | null; phone: string | null };

// 후보 목록 + (AI 켜져 있으면) 손님별 안내 문구 초안. 발송은 샵이 직접 (복사해서 문자·카톡으로).
export function RevisitList({ rows, ai }: { rows: Row[]; ai: boolean }) {
  const [state, action, pending] = useActionState<RevisitState | undefined, FormData>(draftRevisit, undefined);
  return (
    <>
      {ai && (
        <form action={action} className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-[#BFD0F7] bg-[#F3F6FF] p-4">
          <p className="text-xs text-[#35466A]">손님별 안내 문구 초안을 만듭니다(최대 20명). 이름·연락처는 보내지 않습니다. 고쳐서 직접 보내 주세요.</p>
          <button disabled={pending} className="min-h-11 rounded-[10px] bg-brand px-4 text-sm font-medium text-white disabled:opacity-60">
            {pending ? "만드는 중…" : "안내 문구 초안 만들기"}
          </button>
          {state?.message && <p className="w-full text-xs text-danger">{state.message}</p>}
        </form>
      )}
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.customer_id} className="rounded-[14px] border border-line bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <a href={`/shop/customers?id=${r.customer_id}`} className="font-bold">
                {r.name}
              </a>
              <span className="text-xs text-ink-muted">
                {r.sport ?? ""} · {r.level ?? "레벨 모름"} · 지난 시즌 {r.lessons}회 · 마지막 {r.last_lesson ?? "—"}
              </span>
            </div>
            {state?.drafts?.[r.customer_id] && (
              <label className="mt-2 flex flex-col gap-1 text-xs text-ink-muted">
                안내 문구 초안 {r.phone ? `· 보낼 곳 ${r.phone}` : ""}
                <textarea readOnly rows={3} value={state.drafts[r.customer_id]} onFocus={(e) => e.currentTarget.select()} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink" />
              </label>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
