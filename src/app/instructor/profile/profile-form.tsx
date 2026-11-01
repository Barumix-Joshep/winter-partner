"use client";

import { useActionState } from "react";
import { saveProfile, type ProfileFormState } from "./actions";
import type { MyInstructorProfile } from "@/lib/instructor/profile";
import { BIO_MAX } from "@/lib/instructor/validate";

const input =
  "mt-1 block min-h-11 w-full rounded-[10px] border border-line bg-white px-3 text-base outline-none focus:border-brand";
const label = "block text-sm font-medium";
const chip =
  "flex min-h-11 cursor-pointer items-center rounded-full border border-line px-4 text-sm has-checked:border-brand has-checked:bg-blue-50 has-checked:text-brand";

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-xs text-danger">{message}</p> : null;
}

type Props = {
  profile: MyInstructorProfile | null;
  sports: { id: number; name: string }[];
  resorts: { id: number; name: string; region: string }[];
};

export function ProfileForm({ profile, sports, resorts }: Props) {
  const [state, action, pending] = useActionState<ProfileFormState | undefined, FormData>(saveProfile, undefined);
  const regions = [...new Set(resorts.map((r) => r.region))];

  return (
    <form action={action} className="mt-5 flex flex-col gap-5 rounded-[14px] border border-line bg-white p-5">
      <fieldset>
        <legend className={label}>종목</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {sports.map((s) => (
            <label key={s.id} className={chip}>
              <input type="checkbox" name="sport_ids" value={s.id} defaultChecked={profile?.sportIds.includes(s.id)} className="sr-only" />
              {s.name}
            </label>
          ))}
        </div>
        <FieldError message={state?.errors?.sportIds} />
      </fieldset>

      <label className={label}>
        레벨 <span className="font-normal text-ink-muted">(예: KSIA Level 2)</span>
        <input name="level" defaultValue={profile?.level ?? ""} className={input} />
      </label>
      <p className="-mt-3 text-xs text-ink-muted">자격증은 본사 검증 뒤에만 프로필에 표시됩니다.</p>

      <label className={label}>
        기본 강습료 <span className="font-normal text-ink-muted">(2시간 1:1 기준, 원)</span>
        <input name="base_rate" inputMode="numeric" defaultValue={profile?.baseRate ?? ""} placeholder="80000" className={input} />
        <FieldError message={state?.errors?.baseRate} />
      </label>

      <fieldset>
        <legend className={label}>활동 스키장</legend>
        <div className="mt-2 flex flex-col gap-3">
          {regions.map((region) => (
            <div key={region}>
              <p className="text-xs font-medium text-ink-muted">{region}</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {resorts
                  .filter((r) => r.region === region)
                  .map((r) => (
                    <label key={r.id} className={chip}>
                      <input type="checkbox" name="resort_ids" value={r.id} defaultChecked={profile?.resortIds.includes(r.id)} className="sr-only" />
                      {r.name}
                    </label>
                  ))}
              </div>
            </div>
          ))}
        </div>
        <FieldError message={state?.errors?.resortIds} />
      </fieldset>

      <label className={label}>
        소개
        <textarea
          name="bio"
          rows={4}
          maxLength={BIO_MAX}
          defaultValue={profile?.bio ?? ""}
          placeholder="강습 경력, 잘하는 연령대·레벨 등"
          className={`${input} py-2`}
        />
        <FieldError message={state?.errors?.bio} />
      </label>

      {state?.message && (
        <p role="status" className={`text-sm ${state.saved ? "text-brand" : "text-danger"}`}>
          {state.message}
        </p>
      )}
      <button
        disabled={pending}
        className="min-h-11 rounded-[10px] bg-brand font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "저장 중…" : "저장"}
      </button>
    </form>
  );
}
