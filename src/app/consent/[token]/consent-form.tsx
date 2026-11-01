"use client";

import { useActionState } from "react";
import { submitConsent, type ConsentState } from "./actions";
import { OPTIONAL_CONSENTS, type OptionalConsentKind } from "@/lib/privacy/texts";

export function ConsentForm({ token, minor }: { token: string; minor: boolean }) {
  const [state, action, pending] = useActionState<ConsentState | undefined, FormData>(submitConsent, undefined);
  if (state?.done) {
    return (
      <p role="status" className="rounded-[14px] border border-line bg-white p-5 text-sm">
        선택을 저장했습니다. 고맙습니다. 바꾸고 싶으면 샵에 말씀해 주세요.
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4 rounded-[14px] border border-line bg-white p-5">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-[#35466A]">
        {minor ? "14세 미만 손님이라 보호자께서 직접 골라 주세요." : "원하는 항목만 골라 주세요."} 고르지 않아도 강습을 받는 데에는 영향이 없습니다.
      </p>
      {(Object.keys(OPTIONAL_CONSENTS) as OptionalConsentKind[]).map((k) => (
        <label key={k} className="flex min-h-11 items-start gap-3 text-sm">
          <input type="checkbox" name={k} className="mt-1 size-5" />
          <span>
            <span className="font-medium">{OPTIONAL_CONSENTS[k].label}</span>
            <span className="mt-0.5 block text-xs text-ink-muted">{OPTIONAL_CONSENTS[k].detail}</span>
          </span>
        </label>
      ))}
      {minor && (
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input type="checkbox" name="guardian" required className="mt-1 size-5" />
          <span>저는 이 손님의 법정대리인(보호자)입니다.</span>
        </label>
      )}
      {state?.message && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      <button disabled={pending} className="min-h-12 rounded-[10px] bg-brand text-sm font-medium text-white disabled:opacity-60">
        {pending ? "저장 중…" : "선택 저장"}
      </button>
    </form>
  );
}
