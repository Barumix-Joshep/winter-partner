"use client";

import { useActionState } from "react";
import { chooseRole } from "./actions";
import type { FormState } from "@/app/login/actions";

export function OnboardingForm() {
  const [state, action, pending] = useActionState<FormState | undefined, FormData>(chooseRole, undefined);
  return (
    <form action={action} className="flex flex-col gap-4 rounded-[14px] border border-line bg-white p-5">
      <fieldset>
        <legend className="block text-sm font-medium">역할</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[
            { value: "shop_admin", title: "샵 관리자", desc: "렌탈샵·강습팀" },
            { value: "instructor", title: "강사", desc: "스키·스노보드" },
          ].map((r) => (
            <label
              key={r.value}
              className="flex min-h-11 cursor-pointer flex-col rounded-[10px] border border-line p-3 has-checked:border-brand has-checked:bg-blue-50"
            >
              <input type="radio" name="role" value={r.value} required className="sr-only" />
              <span className="text-sm font-bold">{r.title}</span>
              <span className="text-xs text-ink-muted">{r.desc}</span>
            </label>
          ))}
        </div>
        {state?.errors?.role && <p className="mt-1 text-xs text-danger">{state.errors.role}</p>}
      </fieldset>
      <label className="block text-sm font-medium">
        이름
        <input
          name="name"
          autoComplete="name"
          required
          className="mt-1 block min-h-11 w-full rounded-[10px] border border-line bg-white px-3 text-base outline-none focus:border-brand"
        />
        {state?.errors?.name && <p className="mt-1 text-xs text-danger">{state.errors.name}</p>}
      </label>
      <label className="flex min-h-11 items-start gap-2 text-sm">
        <input type="checkbox" name="agree" required className="mt-1 size-4" />
        <span>
          <a href="/terms" target="_blank" className="text-brand underline">이용약관</a>과{" "}
          <a href="/privacy" target="_blank" className="text-brand underline">개인정보 처리방침</a>에 동의합니다 (필수)
        </span>
      </label>
      {state?.errors?.agree && <p className="text-xs text-danger">{state.errors.agree}</p>}
      {state?.message && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      <button
        disabled={pending}
        className="min-h-11 rounded-[10px] bg-brand font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "저장 중…" : "시작하기"}
      </button>
    </form>
  );
}
