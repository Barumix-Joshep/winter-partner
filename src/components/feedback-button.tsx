"use client";

import { useActionState, useState } from "react";
import { usePathname } from "next/navigation";
import { sendFeedback, type FeedbackState } from "./feedback-actions";

// 모든 화면 하단 "의견 보내기" (P16-6). 손님이 여는 동의·셀프 등록 화면에는 두지 않는다.
const HIDDEN = ["/consent/", "/join/", "/offline"];

export function FeedbackButton() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FeedbackState | undefined, FormData>(sendFeedback, undefined);
  if (HIDDEN.some((h) => path.startsWith(h))) return null;
  // 강사 화면은 하단 탭이 덮지 않게 띄운다
  const pad = path.startsWith("/instructor") ? "pb-[calc(6rem+env(safe-area-inset-bottom,0px))]" : "pb-6";

  return (
    <footer className={`mx-auto w-full max-w-2xl px-5 ${pad} print:hidden`}>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="ml-auto flex min-h-11 items-center text-sm text-ink-muted underline">
          의견 보내기
        </button>
      ) : state?.done ? (
        <p role="status" className="rounded-[14px] border border-line bg-white p-4 text-sm leading-6">
          고맙습니다. 본사에서 읽고 확인하겠습니다.
          {state.masked && " 적어 주신 전화번호·이메일은 개인정보 보호를 위해 가려서 받았습니다."}
        </p>
      ) : (
        <form action={action} className="flex flex-col gap-3 rounded-[14px] border border-line bg-white p-4">
          <h2 className="font-bold">의견 보내기</h2>
          <p className="text-xs leading-5 text-ink-muted">
            불편한 점이나 바라는 점을 적어 주세요. 지금 화면 주소({path})가 함께 전달됩니다.
            <strong className="text-ink"> 손님·강사의 이름, 연락처, 건강 정보 같은 개인정보는 적지 마세요.</strong>
          </p>
          <input type="hidden" name="path" value={path} />
          <label className="block text-sm font-medium">
            내용
            <textarea name="body" required maxLength={2000} rows={4} className="mt-1 block w-full rounded-[10px] border border-line p-3 text-base outline-none focus:border-brand" />
          </label>
          <label className="block text-sm font-medium">
            답변 받을 연락처 <span className="font-normal text-ink-muted">(선택, 본인 것만)</span>
            <input name="contact" maxLength={100} className="mt-1 block min-h-11 w-full rounded-[10px] border border-line px-3 text-base outline-none focus:border-brand" />
          </label>
          {state?.message && (
            <p role="alert" className="text-sm text-danger">
              {state.message}
            </p>
          )}
          <div className="flex gap-2">
            <button disabled={pending} className="min-h-11 flex-1 rounded-[10px] bg-brand font-medium text-white disabled:opacity-60">
              {pending ? "보내는 중…" : "보내기"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-[10px] border border-line px-4 text-sm">
              닫기
            </button>
          </div>
        </form>
      )}
    </footer>
  );
}
