"use client";

import { useActionState, useEffect, useRef, startTransition } from "react";
import { summarizeCustomer, type SummaryState } from "./summary-action";

// 손님 카드 AI 요약 (참고용). 열 때 한 번 확인하고, 기록이 바뀌었을 때만 새로 만든다.
export function SummaryBox({ id }: { id: string }) {
  const [state, action, pending] = useActionState<SummaryState | undefined, FormData>(summarizeCustomer, undefined);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const fd = new FormData();
    fd.set("id", id);
    startTransition(() => action(fd));
  }, [action, id]);

  const s = state?.summary;
  return (
    <div className="rounded-[14px] border border-[#BFD0F7] bg-[#F3F6FF] p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-bold">요약 <span className="text-xs font-normal text-ink-muted">AI 참고용 · 이름·연락처는 보내지 않음</span></h3>
        <form action={action}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="force" value="1" />
          <button disabled={pending} className="min-h-11 px-2 text-xs text-brand underline disabled:opacity-60">
            {pending ? "만드는 중…" : "새로 만들기"}
          </button>
        </form>
      </div>
      {pending && !s && <p className="mt-2 text-sm text-ink-muted">요약을 만드는 중…</p>}
      {state?.message && <p className="mt-2 text-xs text-ink-muted">{state.message}</p>}
      {s && (
        <div role="status" className="mt-2 flex flex-col gap-2 text-sm">
          <ul>
            {s.summary.map((l, i) => (
              <li key={i} className="ml-4 list-disc">
                {l}
              </li>
            ))}
          </ul>
          {s.nextLesson && (
            <p>
              <span className="text-xs text-ink-muted">다음 강습 제안 · </span>
              {s.nextLesson}
            </p>
          )}
          {s.contactDraft ? (
            <label className="flex flex-col gap-1 text-xs text-ink-muted">
              연락 문구 초안 (고쳐서 직접 보내세요)
              <textarea readOnly rows={2} value={s.contactDraft} className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink" />
            </label>
          ) : (
            <p className="text-xs text-ink-muted">광고 수신 동의가 유효한 손님에게만 연락 문구 초안을 만듭니다.</p>
          )}
        </div>
      )}
    </div>
  );
}
