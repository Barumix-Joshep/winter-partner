"use client";

import { useActionState } from "react";
import { createLink, type LinkState } from "./actions";

const input = "min-h-11 rounded-lg border border-[#CBD3E1] bg-white px-3 text-sm";

// 발급 → QR과 주소를 한 번 보여 주고 인쇄한다 (print:만 남긴다)
export function LinkForm({ shopName }: { shopName: string }) {
  const [state, action, pending] = useActionState<LinkState | undefined, FormData>(createLink, undefined);
  return (
    <>
      <form action={action} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-line bg-white p-5 print:hidden">
        <label className="flex flex-col gap-1.5 text-xs text-ink-muted">
          이름
          <input name="label" defaultValue="카운터" maxLength={40} className={input} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-ink-muted">
          유효 기간 (일)
          <input name="days" type="number" min={1} max={180} defaultValue={120} className={`${input} w-28`} />
        </label>
        <button disabled={pending} className="min-h-11 rounded-[10px] bg-brand px-5 text-sm font-medium text-white disabled:opacity-60">
          {pending ? "만드는 중…" : "QR 만들기"}
        </button>
        {state?.message && <p className="w-full text-sm text-danger">{state.message}</p>}
      </form>

      {state?.svg && state.url && (
        <section className="flex flex-col items-center gap-4 rounded-[14px] border border-line bg-white p-6 text-center print:border-0 print:p-0">
          <p className="text-sm text-ink-muted print:hidden">이 QR과 주소는 지금만 볼 수 있습니다. 인쇄하거나 주소를 복사해 두세요.</p>
          <h2 className="text-2xl font-bold">{shopName}</h2>
          <p className="text-lg">휴대폰으로 찍어 손님 정보를 직접 등록해 주세요</p>
          {/* qrcode가 만든 SVG (우리 서버에서 생성, 사용자 입력 없음) */}
          <div className="w-64 max-w-full [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: state.svg }} />
          <p className="max-w-md text-xs leading-relaxed text-ink-muted">
            입력한 정보는 강습 예약·배정·연락에 쓰이고, 이 샵에서 강습을 맡는 강사에게만 레벨·수업 메모가 제공됩니다. 광고·사진 동의는 선택입니다.
          </p>
          <label className="flex w-full max-w-md flex-col gap-1 text-left text-xs text-ink-muted print:hidden">
            등록 주소
            <input readOnly value={state.url} onFocus={(e) => e.currentTarget.select()} aria-label="등록 주소" className={`${input} text-ink`} />
          </label>
          <button type="button" onClick={() => window.print()} className="min-h-11 rounded-[10px] border-[1.5px] border-brand px-5 text-sm font-medium text-brand print:hidden">
            인쇄
          </button>
        </section>
      )}
    </>
  );
}
