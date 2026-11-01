"use client";

import { useActionState } from "react";
import { createConsentLink } from "./actions";

// 동의 받기 링크: 샵이 손님(보호자)에게 문자·카톡으로 보낸다. 손님이 직접 고른 동의만 유효하다.
export function ConsentLink({ id, minor }: { id: string; minor: boolean }) {
  const [state, action, pending] = useActionState(createConsentLink, undefined);
  return (
    <form action={action} className="mt-3 flex flex-col gap-2 border-t border-[#EEF1F6] pt-3">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-muted">
          {minor ? "14세 미만: 보호자에게 링크를 보내 보호자가 직접 고르게 하세요." : "손님에게 링크를 보내 직접 고르게 하세요."} 링크는 7일 동안 한 번 쓸 수 있습니다.
        </p>
        <button disabled={pending} className="min-h-11 rounded-[10px] border-[1.5px] border-brand bg-white px-4 text-sm font-medium text-brand disabled:opacity-60">
          {pending ? "만드는 중…" : minor ? "보호자 동의 링크 만들기" : "동의 받기 링크 만들기"}
        </button>
      </div>
      {state?.url && (
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          이 주소를 보내 주세요 (다시 볼 수 없습니다)
          <input readOnly value={state.url} onFocus={(e) => e.currentTarget.select()} aria-label="동의 링크" className="min-h-11 rounded-lg border border-line bg-surface px-3 text-sm text-ink" />
        </label>
      )}
      {state?.message && <p className="text-xs text-danger">{state.message}</p>}
    </form>
  );
}
