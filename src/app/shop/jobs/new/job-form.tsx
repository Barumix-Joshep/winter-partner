"use client";

import { useActionState, useState } from "react";
import { createJob, type JobFormState } from "./actions";
import { LESSON_TYPES, PATCH_PAID_BY, type LessonType } from "@/lib/shop/job";

const field = "flex flex-col gap-1.5 text-xs text-ink-muted";
const input = "min-h-11 rounded-lg border border-[#CBD3E1] bg-white px-3 text-sm text-ink";

function Err({ m }: { m?: string }) {
  return m ? <span className="text-xs text-danger">{m}</span> : null;
}

type Props = {
  resorts: { id: number; name: string }[];
  sports: { id: number; name: string }[];
  customers: { id: string; name: string; level: string | null }[];
};

export function JobForm({ resorts, sports, customers }: Props) {
  const [state, action, pending] = useActionState<JobFormState | undefined, FormData>(createJob, undefined);
  const [lessonType, setLessonType] = useState<LessonType>("private");
  const [customerId, setCustomerId] = useState("");
  const range = LESSON_TYPES[lessonType];
  const e = state?.errors ?? {};

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4 rounded-[14px] border border-line bg-white p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={field}>
          스키장
          <select name="resort_id" className={input}>
            {resorts.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <Err m={e.resortId} />
        </label>
        <label className={field}>
          종목
          <select name="sport_id" className={input}>
            {sports.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <Err m={e.sportId} />
        </label>
        <label className={field}>
          날짜
          <input type="date" name="date" required className={input} />
          <Err m={e.date} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className={field}>
            시작
            <input type="time" name="start" defaultValue="10:00" step={600} required className={input} />
            <Err m={e.start} />
          </label>
          <label className={field}>
            끝
            <input type="time" name="end" defaultValue="12:00" step={600} required className={input} />
            <Err m={e.end} />
          </label>
        </div>
        <label className={field}>
          강습 유형
          <select
            name="lesson_type"
            value={lessonType}
            onChange={(ev) => setLessonType(ev.target.value as LessonType)}
            className={input}
          >
            {Object.entries(LESSON_TYPES).map(([k, t]) => (
              <option key={k} value={k}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          인원
          <input
            key={lessonType}
            type="number"
            name="student_count"
            min={range.min}
            max={range.max}
            defaultValue={range.min}
            readOnly={range.min === range.max}
            className={input}
          />
          <Err m={e.studentCount} />
        </label>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-[10px] border border-line p-3">
        <legend className="px-1.5 text-xs text-ink-muted">손님 (연락처는 샵만 봅니다)</legend>
        <label className={field}>
          기존 손님
          <select name="customer_id" value={customerId} onChange={(ev) => setCustomerId(ev.target.value)} className={input}>
            <option value="">새 손님 입력</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.level ? ` (${c.level})` : ""}
              </option>
            ))}
          </select>
          <Err m={e.customer} />
        </label>
        {!customerId && (
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={field}>
              이름
              <input name="new_customer_name" placeholder="박민준 외 1명" className={input} />
            </label>
            <label className={field}>
              연락처
              <input name="new_customer_phone" type="tel" placeholder="010-0000-0000" className={input} />
            </label>
            <label className={field}>
              레벨
              <input name="new_customer_level" placeholder="초급" className={input} />
            </label>
          </div>
        )}
      </fieldset>

      <label className={field}>
        요청 사항 <span>(강사에게 보입니다)</span>
        <textarea name="note" rows={2} placeholder="두 아이 모두 처음입니다" className={`${input} py-2`} />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className={field}>
          강습 허가권(패치)
          <select name="patch_paid_by" defaultValue="shop" className={input}>
            {Object.entries(PATCH_PAID_BY).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          손님 강습료 (원, 샵만 봄)
          <input name="customer_price" inputMode="numeric" placeholder="220000" className={input} />
          <Err m={e.customerPrice} />
        </label>
        <label className={field}>
          강사 지급액 (원)
          <input name="instructor_rate" inputMode="numeric" placeholder="120000" className={input} />
          <Err m={e.instructorRate} />
        </label>
      </div>

      {state?.message && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      <div className="flex justify-end">
        <button disabled={pending} className="min-h-11 rounded-[10px] bg-brand px-5 text-sm font-medium text-white disabled:opacity-60">
          {pending ? "저장 중…" : "임시 저장"}
        </button>
      </div>
    </form>
  );
}
