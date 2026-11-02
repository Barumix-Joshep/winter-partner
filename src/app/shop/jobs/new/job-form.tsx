"use client";

import { useActionState, useState } from "react";
import { createJob, type JobFormState } from "./actions";
import { LESSON_TYPES, PATCH_PAID_BY, type LessonType } from "@/lib/shop/job";
import { CollectionNotice } from "@/components/collection-notice";
import { extractIntake, type IntakeState } from "./intake-action";
import type { JobPrefill } from "./prefill";

const field = "flex flex-col gap-1.5 text-xs text-ink-muted";
const input = "min-h-11 rounded-lg border border-[#CBD3E1] bg-white px-3 text-sm text-ink";

function Err({ m }: { m?: string }) {
  return m ? <span className="text-xs text-danger">{m}</span> : null;
}

type Props = {
  resorts: { id: number; name: string }[];
  sports: { id: number; name: string }[];
  customers: { id: string; name: string; level: string | null }[];
  defaultCustomerId?: string;
  aiIntake?: boolean;
};

// AI 접수 자동 입력(켜져 있을 때만) → 아래 폼 칸을 미리 채운다. 저장은 사장님이 확인한 뒤.
export function JobForm({ aiIntake = false, ...props }: Props) {
  const [intake, intakeAction, reading] = useActionState<IntakeState | undefined, FormData>(extractIntake, undefined);
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {aiIntake && (
        <form action={intakeAction} className="flex flex-col gap-2 rounded-[14px] border border-[#BFD0F7] bg-[#F3F6FF] p-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            문자·카톡 붙여넣기
            <textarea
              name="intake"
              rows={3}
              maxLength={2000}
              placeholder="손님이 보낸 예약 문자를 그대로 붙여 넣으면 아래 칸을 채워 드립니다. 저장 전에 꼭 확인해 주세요."
              className="rounded-lg border border-[#CBD3E1] bg-white px-3 py-2 text-sm font-normal"
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-ink-muted">연락처는 지우고 보냅니다. 확신 없는 칸은 노란 테두리로 표시합니다.</p>
            <button disabled={reading} className="min-h-11 rounded-[10px] bg-brand px-4 text-sm font-medium text-white disabled:opacity-60">
              {reading ? "읽는 중…" : "자동 입력"}
            </button>
          </div>
          {intake?.message && (
            <p role="alert" className="text-xs text-danger">
              {intake.message}
            </p>
          )}
          {intake?.prefill && (
            <p role="status" className="text-xs text-brand">
              칸을 채웠습니다. 내용을 확인하고 임시 저장해 주세요.
            </p>
          )}
        </form>
      )}
      <JobFields key={intake?.prefill ? JSON.stringify(intake.prefill) : "manual"} {...props} prefill={intake?.prefill} />
    </div>
  );
}

const WARN = "border-[#E0A100] bg-[#FFF8E1]";

function JobFields({ resorts, sports, customers, defaultCustomerId = "", prefill }: Omit<Props, "aiIntake"> & { prefill?: JobPrefill }) {
  const [state, action, pending] = useActionState<JobFormState | undefined, FormData>(createJob, undefined);
  const [lessonType, setLessonType] = useState<LessonType>(prefill?.lessonType ?? "private");
  const [customerId, setCustomerId] = useState(prefill?.customerId ?? (prefill?.newCustomerName ? "" : defaultCustomerId));
  const range = LESSON_TYPES[lessonType];
  const e = state?.errors ?? {};
  // AI가 확신하지 못한 칸, 또는 채우지 못한 칸
  const warn = (k: string, filled: unknown) => (prefill && (prefill.uncertain.includes(k) || filled == null) ? WARN : "");

  return (
    <form action={action} className="flex flex-col gap-4 rounded-[14px] border border-line bg-white p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={field}>
          스키장
          <select name="resort_id" defaultValue={prefill?.resortId ?? undefined} className={input}>
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
          <select name="sport_id" defaultValue={prefill?.sportId ?? undefined} className={`${input} ${warn("sport", prefill?.sportId)}`}>
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
          <input type="date" name="date" required defaultValue={prefill?.date ?? undefined} className={`${input} ${warn("date", prefill?.date)}`} />
          <Err m={e.date} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className={field}>
            시작
            <input type="time" name="start" defaultValue={prefill?.start ?? "10:00"} step={600} required className={`${input} ${warn("start", prefill?.start)}`} />
            <Err m={e.start} />
          </label>
          <label className={field}>
            끝
            <input type="time" name="end" defaultValue={prefill?.end ?? "12:00"} step={600} required className={`${input} ${warn("end", prefill?.end)}`} />
            <Err m={e.end} />
          </label>
        </div>
        <label className={field}>
          강습 유형
          <select
            name="lesson_type"
            value={lessonType}
            onChange={(ev) => setLessonType(ev.target.value as LessonType)}
            className={`${input} ${warn("lesson_type", prefill?.lessonType)}`}
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
            defaultValue={prefill?.studentCount && prefill.studentCount >= range.min && prefill.studentCount <= range.max ? prefill.studentCount : range.min}
            readOnly={range.min === range.max}
            className={input}
          />
          <Err m={e.studentCount} />
        </label>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-[10px] border border-line p-3">
        <legend className="px-1.5 text-xs text-ink-muted">손님 (연락처는 샵만 봅니다)</legend>
        <CollectionNotice />
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
              <input name="new_customer_name" placeholder="박민준 외 1명" defaultValue={prefill?.newCustomerName ?? undefined} className={input} />
            </label>
            <label className={field}>
              연락처
              <input name="new_customer_phone" type="tel" placeholder="010-0000-0000" className={input} />
            </label>
            <label className={field}>
              레벨
              <input name="new_customer_level" placeholder="초급" defaultValue={prefill?.level ?? undefined} className={input} />
            </label>
          </div>
        )}
      </fieldset>

      <label className={field}>
        요청 사항 <span>(강사에게 보입니다)</span>
        <textarea name="note" rows={2} placeholder="두 아이 모두 처음입니다" defaultValue={prefill?.note ?? undefined} className={`${input} py-2`} />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className={field}>
          강습 허가권(패치)
          <select name="patch_paid_by" defaultValue={prefill?.patchPaidBy ?? "shop"} className={input}>
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
