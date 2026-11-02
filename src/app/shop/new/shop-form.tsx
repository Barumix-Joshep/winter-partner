"use client";

import { useActionState } from "react";
import { registerShop, type ShopFormState } from "./actions";

export type ShopInitial = { type: string; name: string; businessNo: string | null; ownerName: string | null; resortIds: number[] };
type Action = (prev: ShopFormState | undefined, fd: FormData) => Promise<ShopFormState>;

export type Resort = { id: number; name: string; region: string };

const input =
  "mt-1 block min-h-11 w-full rounded-[10px] border border-line bg-white px-3 text-base outline-none focus:border-brand";
const label = "block text-sm font-medium";

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-xs text-danger">{message}</p> : null;
}

// 새 샵 등록과 샵 정보 수정(/shop/settings)이 함께 쓴다. 수정에서는 종류를 바꾸지 않는다.
export function ShopForm({ resorts, initial, onSubmit = registerShop }: { resorts: Resort[]; initial?: ShopInitial; onSubmit?: Action }) {
  const [state, action, pending] = useActionState<ShopFormState | undefined, FormData>(onSubmit, undefined);
  const edit = !!initial;
  const regions = [...new Set(resorts.map((r) => r.region))];

  return (
    <form action={action} className="mt-5 flex flex-col gap-5 rounded-[14px] border border-line bg-white p-5">
      {edit ? (
        <input type="hidden" name="type" value={initial.type} />
      ) : (
      <fieldset>
        <legend className={label}>종류</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[
            { value: "rental_shop", title: "렌탈샵", desc: "장비 대여 + 강습 연결" },
            { value: "lesson_team", title: "강습팀", desc: "강습 전문 팀" },
          ].map((t) => (
            <label
              key={t.value}
              className="flex min-h-11 cursor-pointer flex-col rounded-[10px] border border-line p-3 has-checked:border-brand has-checked:bg-blue-50"
            >
              <input type="radio" name="type" value={t.value} required className="sr-only" />
              <span className="text-sm font-bold">{t.title}</span>
              <span className="text-xs text-ink-muted">{t.desc}</span>
            </label>
          ))}
        </div>
        <FieldError message={state?.errors?.type} />
      </fieldset>
      )}

      <label className={label}>
        샵 이름
        <input name="name" required defaultValue={initial?.name} className={input} />
        <FieldError message={state?.errors?.name} />
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className={label}>
          사업자등록번호 <span className="font-normal text-ink-muted">(선택)</span>
          <input name="business_no" inputMode="numeric" placeholder="000-00-00000" defaultValue={initial?.businessNo ?? ""} className={input} />
          <FieldError message={state?.errors?.businessNo} />
        </label>
        <label className={label}>
          대표자 <span className="font-normal text-ink-muted">(선택)</span>
          <input name="owner_name" defaultValue={initial?.ownerName ?? ""} className={input} />
        </label>
      </div>

      <fieldset>
        <legend className={label}>영업 스키장</legend>
        <p className="text-xs text-ink-muted">강사 찾기와 공고에 이 스키장이 쓰입니다. 여러 곳을 고를 수 있습니다.</p>
        <div className="mt-3 flex flex-col gap-4">
          {regions.map((region) => (
            <div key={region}>
              <p className="text-xs font-medium text-ink-muted">{region}</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {resorts
                  .filter((r) => r.region === region)
                  .map((r) => (
                    <label
                      key={r.id}
                      className="flex min-h-11 cursor-pointer items-center rounded-full border border-line px-4 text-sm has-checked:border-brand has-checked:bg-blue-50 has-checked:text-brand"
                    >
                      <input type="checkbox" name="resort_ids" value={r.id} defaultChecked={initial?.resortIds.includes(r.id)} className="sr-only" />
                      {r.name}
                    </label>
                  ))}
              </div>
            </div>
          ))}
        </div>
        <FieldError message={state?.errors?.resortIds} />
      </fieldset>

      {state?.message && (
        <p role="alert" className={`text-sm ${state.ok ? "text-brand" : "text-danger"}`}>
          {state.message}
        </p>
      )}
      <button
        disabled={pending}
        className="min-h-11 rounded-[10px] bg-brand font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "저장 중…" : edit ? "저장" : "등록하기"}
      </button>
    </form>
  );
}
