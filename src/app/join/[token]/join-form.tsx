"use client";

import { useActionState, useState } from "react";
import { joinShop, type JoinState } from "./actions";
import { OPTIONAL_CONSENTS, type OptionalConsentKind } from "@/lib/privacy/texts";
import { isMinor } from "@/lib/customer/minor";

const field = "flex flex-col gap-1.5 text-sm";
const input = "min-h-12 rounded-[10px] border border-[#CBD3E1] bg-white px-3 text-base text-ink";

export function JoinForm({ token, nowYear }: { token: string; nowYear: number }) {
  const [state, action, pending] = useActionState<JoinState | undefined, FormData>(joinShop, undefined);
  const v = state?.values ?? {};
  const [birth, setBirth] = useState(v.birth_year ?? "");
  const minor = /^\d{4}$/.test(birth) && isMinor(Number(birth), nowYear);
  const e = state?.errors ?? {};
  const err = (k: string) => (e[k] ? <span className="text-xs text-danger">{e[k]}</span> : null);

  if (state?.done) {
    return (
      <p role="status" className="rounded-[14px] border border-line bg-white p-5 text-base">
        등록했습니다. 카운터에 이름을 말씀해 주세요.
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4 rounded-[14px] border border-line bg-white p-5">
      <input type="hidden" name="token" value={token} />
      <label className={field}>
        이름
        <input name="name" required autoComplete="name" defaultValue={v.name} className={input} />
        {err("name")}
      </label>
      <label className={field}>
        출생 연도 <span className="text-xs text-ink-muted">(선택, 14세 미만이면 보호자가 입력해 주세요)</span>
        <input name="birth_year" inputMode="numeric" maxLength={4} placeholder="2016" value={birth} onChange={(ev) => setBirth(ev.target.value)} className={input} />
        {err("birth_year")}
      </label>
      <label className={field}>
        휴대폰 {minor && <span className="text-xs text-ink-muted">(선택)</span>}
        <input name="phone" type="tel" autoComplete="tel" placeholder="010-0000-0000" defaultValue={v.phone} className={input} />
        {err("phone")}
      </label>
      <fieldset className="flex flex-col gap-3 rounded-[10px] border border-line p-3">
        <legend className="px-1 text-sm">보호자 {minor ? "(필수)" : "(어린이 손님일 때)"}</legend>
        <label className={field}>
          보호자 이름
          <input name="guardian_name" defaultValue={v.guardian_name} className={input} />
          {err("guardian_name")}
        </label>
        <label className={field}>
          보호자 휴대폰
          <input name="guardian_phone" type="tel" placeholder="010-0000-0000" defaultValue={v.guardian_phone} className={input} />
          {err("guardian_phone")}
        </label>
        {minor && (
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input type="checkbox" name="guardian_confirm" className="mt-1 size-5" />
            <span>저는 이 손님의 법정대리인(보호자)이고 직접 입력합니다.</span>
          </label>
        )}
        {err("guardian_confirm")}
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <label className={field}>
          레벨
          <select name="level" defaultValue={v.level ?? ""} className={input}>
            <option value="">잘 모름</option>
            <option>처음</option>
            <option>입문</option>
            <option>초급</option>
            <option>중급</option>
            <option>상급</option>
          </select>
        </label>
        <label className={field}>
          장비 사이즈
          <input name="equipment_size" placeholder="키 140 · 발 220" defaultValue={v.equipment_size} className={input} />
        </label>
      </div>
      <p className="rounded-lg bg-surface px-3 py-2 text-xs leading-relaxed text-[#35466A]">
        부상·질환 같은 건강 정보는 적지 마시고, 필요하면 강사에게 직접 말씀해 주세요.
      </p>
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">선택 동의 {minor && <span className="text-xs font-normal text-ink-muted">(보호자 확인 후 효력이 생깁니다)</span>}</legend>
        {(Object.keys(OPTIONAL_CONSENTS) as OptionalConsentKind[]).map((k) => (
          <label key={k} className="flex min-h-11 items-start gap-3 text-sm">
            <input type="checkbox" name={k} className="mt-1 size-5" />
            <span>
              <span className="font-medium">{OPTIONAL_CONSENTS[k].label}</span>
              <span className="mt-0.5 block text-xs text-ink-muted">{OPTIONAL_CONSENTS[k].detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {state?.message && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      <button disabled={pending} className="min-h-12 rounded-[10px] bg-brand text-base font-medium text-white disabled:opacity-60">
        {pending ? "등록 중…" : "등록하기"}
      </button>
    </form>
  );
}
