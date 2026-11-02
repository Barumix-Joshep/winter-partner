"use client";

import { useActionState } from "react";
import { uploadCert, type CertFormState } from "./cert-actions";

const input =
  "mt-1 block min-h-11 w-full rounded-[10px] border border-line bg-white px-3 text-base outline-none focus:border-brand";

export function CertUploadForm({ aiNotice = false }: { aiNotice?: boolean }) {
  const [state, action, pending] = useActionState<CertFormState | undefined, FormData>(uploadCert, undefined);
  return (
    <form action={action} className="mt-3 flex flex-col gap-4 rounded-[14px] border border-dashed border-line bg-white p-5">
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium">
          발급처
          <input name="issuer" placeholder="KSIA" required className={input} />
          {state?.errors?.issuer && <p className="mt-1 text-xs text-danger">{state.errors.issuer}</p>}
        </label>
        <label className="block text-sm font-medium">
          등급
          <input name="grade" placeholder="Level 2" className={input} />
        </label>
      </div>
      <label className="block text-sm font-medium">
        자격증 사진 또는 PDF <span className="font-normal text-ink-muted">(4MB까지)</span>
        <input
          name="file"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          required
          className="mt-1 block w-full text-sm file:mr-3 file:min-h-11 file:rounded-[10px] file:border-0 file:bg-surface file:px-4 file:text-sm"
        />
        {state?.errors?.file && <p className="mt-1 text-xs text-danger">{state.errors.file}</p>}
      </label>
      {aiNotice && (
        <p className="text-xs text-ink-muted">
          검증을 위해 자격증 이미지가 AI 판독 서비스(Anthropic)로 전송됩니다. 판독 결과는 본사 확인용 참고값이고, 승인은 본사 담당자가 합니다.
        </p>
      )}
      {state?.message && (
        <p role="status" className={`text-sm ${state.ok ? "text-brand" : "text-danger"}`}>
          {state.message}
        </p>
      )}
      <button
        disabled={pending}
        className="min-h-11 rounded-[10px] border border-brand font-medium text-brand disabled:opacity-60"
      >
        {pending ? "올리는 중…" : "자격증 올리기"}
      </button>
    </form>
  );
}
