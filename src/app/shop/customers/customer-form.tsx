"use client";

import { useActionState } from "react";
import { saveCustomer, type CustomerFormState } from "./actions";
import { CollectionNotice } from "@/components/collection-notice";

export type CustomerValues = {
  id?: string;
  name?: string;
  phone?: string | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  level?: string | null;
  equipment_size?: string | null;
  tags?: string[];
  memo?: string | null;
  next_contact_on?: string | null;
  birth_year?: number | null;
};

const field = "flex flex-col gap-1.5 text-xs text-ink-muted";
const input = "min-h-11 rounded-lg border border-[#CBD3E1] bg-white px-3 text-sm text-ink";

export function CustomerForm({ values }: { values: CustomerValues }) {
  const [state, action, pending] = useActionState<CustomerFormState | undefined, FormData>(saveCustomer, undefined);
  const e = state?.errors ?? {};
  // 실패하면 방금 입력한 값으로 다시 채운다
  const back = state?.values;
  const v = (k: keyof CustomerValues & string, fallback: string) => back?.[k] ?? fallback;
  const err = (m?: string) => (m ? <span className="text-danger">{m}</span> : null);
  return (
    <form action={action} className="flex flex-col gap-3">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={field}>
          이름
          <input name="name" required defaultValue={v("name", values.name ?? "")} className={input} />
          {err(e.name)}
        </label>
        <label className={field}>
          연락처
          <input name="phone" type="tel" defaultValue={v("phone", values.phone ?? "")} placeholder="010-0000-0000" className={input} />
          {err(e.phone)}
        </label>
        <label className={field}>
          출생 연도 (선택)
          <input name="birth_year" inputMode="numeric" maxLength={4} defaultValue={v("birth_year", values.birth_year ? String(values.birth_year) : "")} placeholder="2016" className={input} />
          {err(e.birth_year)}
        </label>
        <label className={field}>
          보호자 <span>(14세 미만은 필수)</span>
          <input name="guardian_name" defaultValue={v("guardian_name", values.guardian_name ?? "")} placeholder="어린이 손님일 때" className={input} />
          {err(e.guardian_name)}
        </label>
        <label className={field}>
          보호자 연락처
          <input name="guardian_phone" type="tel" defaultValue={v("guardian_phone", values.guardian_phone ?? "")} className={input} />
          {err(e.guardian_phone)}
        </label>
        <label className={field}>
          레벨
          <input name="level" defaultValue={v("level", values.level ?? "")} placeholder="초급 → 초중급" className={input} />
        </label>
        <label className={field}>
          장비 사이즈
          <input name="equipment_size" defaultValue={v("equipment_size", values.equipment_size ?? "")} placeholder="스키 120 · 부츠 220 · 헬멧 S" className={input} />
        </label>
        <label className={field}>
          태그
          <input name="tags" defaultValue={v("tags", (values.tags ?? []).map((t) => `#${t}`).join(" "))} placeholder="#가족 #재방문" className={input} />
        </label>
        <label className={field}>
          다음 연락
          <input name="next_contact_on" type="date" defaultValue={v("next_contact_on", values.next_contact_on ?? "")} className={input} />
          {err(e.next_contact_on)}
        </label>
      </div>
      <label className={field}>
        샵 메모 <span>(샵만 봅니다)</span>
        <textarea name="memo" rows={3} maxLength={2000} defaultValue={v("memo", values.memo ?? "")} className={`${input} py-2`} />
        {err(e.memo)}
      </label>
      <CollectionNotice />
      {state?.message && <p className={`text-sm ${state.ok ? "text-brand" : "text-danger"}`}>{state.message}</p>}
      <button disabled={pending} className="min-h-11 self-end rounded-[10px] bg-brand px-5 text-sm font-medium text-white disabled:opacity-60">
        {pending ? "저장 중…" : values.id ? "저장" : "손님 등록"}
      </button>
    </form>
  );
}
