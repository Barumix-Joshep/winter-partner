"use client";

import { useActionState } from "react";
import { commitImport, previewImport, type ImportState } from "./actions";

const STATUS = {
  ok: { label: "등록", cls: "bg-blue-50 text-brand" },
  skip: { label: "건너뜀", cls: "bg-surface text-ink-muted" },
  error: { label: "오류", cls: "bg-red-50 text-danger" },
} as const;

export function ImportForm({ type }: { type: ImportState["type"] }) {
  const [preview, previewAction, previewing] = useActionState(previewImport, { type });
  const [result, commitAction, committing] = useActionState(commitImport, { type });
  const who = type === "customers" ? "손님" : "강사";

  if (result.done) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-[14px] border border-line bg-white p-5 text-sm leading-6">
        <p className="font-bold">
          {type === "customers" ? `손님 ${result.done.added}명을 등록했습니다.` : `강사 ${result.done.added}명에게 전속 초대를 보냈습니다.`}
          {result.done.skipped > 0 && ` (${result.done.skipped}행은 건너뜀)`}
        </p>
        {!!result.done.notJoined?.length && (
          <div>
            <p>아직 가입하지 않은 강사 {result.done.notJoined.length}명: {result.done.notJoined.join(", ")}</p>
            <p className="text-ink-muted">아래 주소로 가입을 부탁해 주세요. 가입하면 &lsquo;강사 찾기&rsquo;에서 전속을 제안할 수 있습니다.</p>
            <p className="mt-1 break-all rounded-lg bg-surface p-2 font-mono text-xs">{result.done.signupUrl}</p>
          </div>
        )}
        <a href={type === "customers" ? "/shop/customers" : "/shop/team"} className="flex min-h-11 items-center text-brand underline">
          {type === "customers" ? "손님 목록 보기" : "전속 강사 보기"}
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form action={previewAction} className="flex flex-col gap-3 rounded-[14px] border border-line bg-white p-5">
        <a href={`/shop/import/template?type=${type}`} className="flex min-h-11 items-center self-start text-sm text-brand underline">
          {who} 양식 내려받기 (CSV)
        </a>
        <p className="text-xs leading-5 text-ink-muted">
          엑셀에서 양식에 맞춰 적은 뒤 &lsquo;CSV UTF-8&rsquo;로 저장해 올려 주세요. 둘째 줄의 [테스트] 예시는 지우고 쓰세요.
          {type === "customers" ? " 한 번에 500명까지." : " 한 번에 300명까지."}
        </p>
        <label className="block text-sm font-medium">
          CSV 파일
          <input type="file" name="file" accept=".csv,text/csv" required className="mt-1 block min-h-11 w-full text-sm" />
        </label>
        {preview.fileError && (
          <p role="alert" className="text-sm text-danger">
            {preview.fileError}
          </p>
        )}
        <button disabled={previewing} className="min-h-11 rounded-[10px] border border-brand font-medium text-brand disabled:opacity-50">
          {previewing ? "확인 중…" : "미리 보기"}
        </button>
      </form>

      {preview.rows && (
        <form action={commitAction} className="flex flex-col gap-3">
          <input type="hidden" name="csv" value={preview.csv ?? ""} />
          <p className="text-sm">
            모두 {preview.rows.length}행 · <strong className="text-brand">등록 {preview.okCount}</strong> · 건너뜀{" "}
            {preview.rows.filter((r) => r.status === "skip").length} · 오류 {preview.rows.filter((r) => r.status === "error").length}
          </p>
          <div className="overflow-x-auto rounded-[14px] border border-line bg-white">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-surface text-xs text-ink-muted">
                <tr>
                  <th className="px-3 py-2">행</th>
                  <th className="px-3 py-2">이름</th>
                  <th className="px-3 py-2">연락처</th>
                  <th className="px-3 py-2">결과</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.line} className="border-t border-line align-top">
                    <td className="px-3 py-2 text-ink-muted">{r.line}</td>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.contact}</td>
                    <td className="px-3 py-2">
                      <span className={`mr-1 rounded-full px-2 py-0.5 text-xs ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                      <span className="text-xs text-ink-muted">{r.reason}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {type === "customers" ? (
            <label className="flex min-h-11 items-start gap-2 rounded-[14px] border border-line bg-white p-4 text-sm leading-6">
              <input type="checkbox" name="notice" className="mt-1 size-4" />
              <span>
                이 손님들에게 개인정보 수집·이용(이름·연락처·레벨 등, 강습 운영 목적)을 안내했습니다. 마케팅 문자 수신 동의는 여기서 받지 않습니다.
                등록 뒤 손님 카드에서 동의 링크로 따로 받아 주세요.{" "}
                <a href="/shop/privacy-notice" target="_blank" className="text-brand underline">
                  손님 안내문 보기
                </a>
              </span>
            </label>
          ) : (
            <p className="rounded-[14px] border border-line bg-white p-4 text-xs leading-5 text-ink-muted">
              올린 휴대폰·이메일은 가입한 강사를 찾는 데만 쓰고 저장하지 않습니다. 초대를 받은 강사가 수락해야 전속이 됩니다.
            </p>
          )}
          {result.message && (
            <p role="alert" className="text-sm text-danger">
              {result.message}
            </p>
          )}
          <button
            disabled={committing || !preview.okCount}
            className="min-h-11 rounded-[10px] bg-brand font-medium text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {committing ? "등록 중…" : type === "customers" ? `손님 ${preview.okCount}명 등록` : `강사 ${preview.okCount}명에게 전속 초대 보내기`}
          </button>
        </form>
      )}
    </div>
  );
}
