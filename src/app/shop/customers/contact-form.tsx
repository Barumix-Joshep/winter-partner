"use client";

import { useActionState } from "react";
import { logContact, type CustomerFormState } from "./actions";
import { CONTACT_CHANNELS } from "@/lib/customer/contact";
import { HEALTH_HINT } from "@/lib/privacy/health";

const field = "flex flex-col gap-1.5 text-xs text-ink-muted";
const input = "min-h-11 rounded-lg border border-[#CBD3E1] bg-white px-3 text-sm text-ink";

// 연락 기록 남기기. 다음 연락일을 비워 두면 '오늘 연락할 손님'에서 빠진다.
export function ContactForm({ id, nextOn, nextNote }: { id: string; nextOn: string | null; nextNote: string | null }) {
  const [state, action, pending] = useActionState<CustomerFormState | undefined, FormData>(logContact, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <label className={field}>
          방법
          <select name="channel" defaultValue="phone" className={input}>
            {Object.entries(CONTACT_CHANNELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          내용
          <input name="memo" maxLength={500} placeholder="시즌 오픈 안내, 12월 둘째 주 예약 희망" aria-describedby="contact-health" className={input} />
          <span id="contact-health">{HEALTH_HINT}</span>
        </label>
        <label className={field}>
          다음 연락일
          <input name="next_on" type="date" defaultValue="" className={input} />
        </label>
        <label className={field}>
          다음 연락 목적
          <input name="next_note" maxLength={100} defaultValue={nextOn ? (nextNote ?? "") : ""} placeholder="예약 확정 연락" className={input} />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-muted">
          다음 연락을 비우면 &lsquo;오늘 연락할 손님&rsquo;에서 빠집니다.{nextOn ? " 지금 잡힌 날짜도 새 값으로 바뀝니다." : ""}
        </p>
        <button disabled={pending} className="min-h-11 rounded-[10px] bg-brand px-5 text-sm font-medium text-white disabled:opacity-60">
          {pending ? "기록 중…" : "연락 기록"}
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
