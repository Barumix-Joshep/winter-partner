"use client";

import { useActionState, useState } from "react";
import { eraseCustomer } from "./actions";

// 손님 삭제 요청 처리: 두 단계 확인 뒤 즉시 익명화 (되돌릴 수 없음)
export function EraseForm({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(eraseCustomer, undefined);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="min-h-11 self-start px-1 text-sm text-danger">
        손님 정보 삭제 요청 처리…
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3 rounded-[14px] border border-red-200 bg-red-50 p-4 text-sm text-[#7A1F1F]">
      <input type="hidden" name="id" value={id} />
      <p>
        <strong>{name}</strong> 손님의 이름·연락처·보호자·메모·연락 기록과 강습 요청 사항·수업 메모를 지금 지웁니다. <strong>되돌릴 수 없습니다.</strong> 통계용 강습 이력(일시·종목·금액)만 남습니다.
      </p>
      <label className="flex flex-col gap-1.5 text-xs">
        확인을 위해 &lsquo;익명화&rsquo;라고 입력해 주세요
        <input name="confirm" autoComplete="off" className="min-h-11 rounded-lg border border-red-200 bg-white px-3 text-sm text-ink" />
      </label>
      {state?.message && <p role="alert">{state.message}</p>}
      <div className="flex gap-2">
        <button disabled={pending} className="min-h-11 rounded-[10px] bg-danger px-4 font-medium text-white disabled:opacity-60">
          {pending ? "처리 중…" : "익명화"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-3 text-ink-muted">
          그만두기
        </button>
      </div>
    </form>
  );
}
