"use client";

import { useActionState } from "react";
import { requestPasswordReset, updatePassword, type FormState } from "./actions";

const input =
  "mt-1 block min-h-11 w-full rounded-[10px] border border-line bg-white px-3 text-base outline-none focus:border-brand";
const label = "block text-sm font-medium";
const button = "min-h-11 rounded-[10px] bg-brand font-medium text-white hover:bg-brand-dark disabled:opacity-60";

function Alert({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="text-sm text-danger">
      {message}
    </p>
  ) : null;
}

export function ForgotForm() {
  const [state, action, pending] = useActionState<FormState | undefined, FormData>(requestPasswordReset, undefined);
  if (state?.sent) return <p className="rounded-lg bg-surface p-4 text-sm leading-6">{state.message}</p>;
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className={label}>
        가입한 이메일
        <input name="email" type="email" autoComplete="email" required className={input} />
        {state?.errors?.email && <p className="mt-1 text-xs text-danger">{state.errors.email}</p>}
      </label>
      <Alert message={state?.message} />
      <button disabled={pending} className={button}>
        {pending ? "보내는 중…" : "재설정 메일 받기"}
      </button>
    </form>
  );
}

export function ResetForm() {
  const [state, action, pending] = useActionState<FormState | undefined, FormData>(updatePassword, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className={label}>
        새 비밀번호 <span className="font-normal text-ink-muted">(8자 이상, 영문·숫자 포함)</span>
        <input name="password" type="password" autoComplete="new-password" minLength={8} required className={input} />
        {state?.errors?.password && <p className="mt-1 text-xs text-danger">{state.errors.password}</p>}
      </label>
      <label className={label}>
        한 번 더
        <input name="confirm" type="password" autoComplete="new-password" minLength={8} required className={input} />
        {state?.errors?.confirm && <p className="mt-1 text-xs text-danger">{state.errors.confirm}</p>}
      </label>
      <Alert message={state?.message} />
      <button disabled={pending} className={button}>
        {pending ? "저장 중…" : "새 비밀번호 저장"}
      </button>
    </form>
  );
}
