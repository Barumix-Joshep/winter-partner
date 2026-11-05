"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn, signUp, type FormState } from "./actions";

const input =
  "mt-1 block min-h-11 w-full rounded-[10px] border border-line bg-white px-3 text-base outline-none focus:border-brand";
const label = "block text-sm font-medium";

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-xs text-danger">{message}</p> : null;
}

export function LoginForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const confirmFailed = params.get("error") === "confirm";

  return (
    <div className="rounded-[14px] border border-line bg-white p-5">
      <div role="tablist" className="mb-5 grid grid-cols-2 gap-1 rounded-[10px] bg-surface p-1 text-sm">
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`min-h-10 rounded-lg font-medium ${mode === m ? "bg-white text-ink shadow-sm" : "text-ink-muted"}`}
          >
            {m === "login" ? "로그인" : "가입"}
          </button>
        ))}
      </div>
      {confirmFailed && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-danger">
          인증 링크가 만료됐거나 잘못됐습니다. 다시 로그인하거나 가입해 주세요.
        </p>
      )}
      {mode === "login" ? <SignInForm next={next} /> : <SignUpForm />}
    </div>
  );
}

function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState | undefined, FormData>(signIn, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <label className={label}>
        이메일
        <input name="email" type="email" autoComplete="email" required className={input} />
        <FieldError message={state?.errors?.email} />
      </label>
      <label className={label}>
        비밀번호
        <input name="password" type="password" autoComplete="current-password" required className={input} />
        <FieldError message={state?.errors?.password} />
      </label>
      {state?.message && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      <button
        disabled={pending}
        className="min-h-11 rounded-[10px] bg-brand font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "로그인 중…" : "로그인"}
      </button>
      <a href="/login/forgot" className="flex min-h-11 items-center self-center text-sm text-ink-muted underline">
        비밀번호를 잊으셨나요?
      </a>
    </form>
  );
}

function SignUpForm() {
  const [state, action, pending] = useActionState<FormState | undefined, FormData>(signUp, undefined);
  if (state?.sent) {
    return <p className="rounded-lg bg-surface p-4 text-sm leading-6">{state.message}</p>;
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset>
        <legend className={label}>어떤 분이세요?</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[
            { value: "shop_admin", title: "샵 관리자", desc: "렌탈샵·강습팀" },
            { value: "instructor", title: "강사", desc: "스키·스노우보드·스노우스케이트" },
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
        <FieldError message={state?.errors?.role} />
      </fieldset>
      <label className={label}>
        이름
        <input name="name" autoComplete="name" required className={input} />
        <FieldError message={state?.errors?.name} />
      </label>
      <label className={label}>
        이메일
        <input name="email" type="email" autoComplete="email" required className={input} />
        <FieldError message={state?.errors?.email} />
      </label>
      <label className={label}>
        비밀번호 <span className="font-normal text-ink-muted">(8자 이상, 영문·숫자 포함)</span>
        <input name="password" type="password" autoComplete="new-password" minLength={8} required className={input} />
        <FieldError message={state?.errors?.password} />
      </label>
      <label className="flex min-h-11 items-start gap-2 text-sm">
        <input type="checkbox" name="agree" required className="mt-1 size-4" />
        <span>
          <a href="/terms" target="_blank" className="text-brand underline">이용약관</a>과{" "}
          <a href="/privacy" target="_blank" className="text-brand underline">개인정보 처리방침</a>에 동의합니다 (필수)
        </span>
      </label>
      <FieldError message={state?.errors?.agree} />
      {state?.message && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      <button
        disabled={pending}
        className="min-h-11 rounded-[10px] bg-brand font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "가입 중…" : "가입하기"}
      </button>
    </form>
  );
}
