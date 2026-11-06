"use client";

import { useActionState, useState } from "react";
import { SUSPEND_REASONS, SUSPEND_REASON_LABEL } from "@/lib/ai/consult/license-admin";
import { addPack, createPlan, extendLicense, grantLicense, setPaid, setQuota, suspendLicense, type LicenseActionState } from "./actions";

// 본사 AI 상담 사용권 버튼들 (P23-3). 확인은 화면 안에서 한다(브라우저 확인 창을 쓰지 않는다).
const input = "mt-1 block min-h-11 w-full rounded-[10px] border border-line bg-white px-3 text-base outline-none focus:border-brand";
const area = "mt-1 block w-full rounded-[10px] border border-line bg-white px-3 py-2 text-base outline-none focus:border-brand";
const primary = "min-h-11 rounded-[10px] bg-brand px-4 text-sm font-medium text-white disabled:opacity-60";
const box = "flex flex-col gap-3 rounded-[14px] border border-line bg-white p-4";

type Action = (prev: LicenseActionState | undefined, f: FormData) => Promise<LicenseActionState>;

function Status({ state }: { state?: LicenseActionState }) {
  if (!state?.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-[#1B6B3A]" : "text-danger"}`}>
      {state.message}
    </p>
  );
}

function useAction(fn: Action) {
  return useActionState<LicenseActionState | undefined, FormData>(fn, undefined);
}

function Note({ label = "본사 메모 (선택, 샵에는 보이지 않음)" }: { label?: string }) {
  return (
    <label className="text-sm font-medium">
      {label}
      <textarea name="note" maxLength={500} rows={2} className={area} />
    </label>
  );
}

export type PlanOption = { id: string; code: string; name: string; trial_days: number };

export function GrantForm({ shopId, plans, today }: { shopId: string; plans: PlanOption[]; today: string }) {
  const [state, action, pending] = useAction(grantLicense);
  const [mode, setMode] = useState<"first_auto_reply" | "fixed">("first_auto_reply");
  return (
    <form action={action} aria-label="체험 부여" className={box}>
      <h3 className="text-sm font-bold">체험 부여</h3>
      <input type="hidden" name="shop_id" value={shopId} />
      {plans.length > 1 && (
        <label className="text-sm font-medium">
          요금제
          <select name="plan_id" defaultValue={plans[0]?.id} className={input}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
        </label>
      )}
      {plans.length === 1 && <input type="hidden" name="plan_id" value={plans[0].id} />}
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="font-medium">시작 기준</legend>
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" name="mode" value="first_auto_reply" checked={mode === "first_auto_reply"} onChange={() => setMode("first_auto_reply")} className="size-5" />
          첫 자동응답이 나간 때부터 (기본)
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" name="mode" value="fixed" checked={mode === "fixed"} onChange={() => setMode("fixed")} className="size-5" />
          날짜 지정
        </label>
      </fieldset>
      {mode === "fixed" && (
        <label className="text-sm font-medium">
          시작일
          <input type="date" name="starts_on" required min={today} className={input} />
        </label>
      )}
      <p className="text-xs text-ink-muted">
        체험 기간은 요금제 값({plans[0] ? `${plans[0].trial_days}일` : "—"}, 한국 날짜 기준·시작일 포함)으로 정해집니다.
      </p>
      <Note />
      <button disabled={pending || plans.length === 0} className={primary}>
        {pending ? "부여 중…" : "체험 부여"}
      </button>
      {plans.length === 0 && <p className="text-sm text-danger">쓸 수 있는 요금제가 없습니다. 아래에서 새 요금제를 만들어 주세요.</p>}
      <Status state={state} />
    </form>
  );
}

export function PaidForm({ shopId, startsOn, endsOn }: { shopId: string; startsOn: string; endsOn: string }) {
  const [state, action, pending] = useAction(setPaid);
  return (
    <form action={action} aria-label="유료 전환" className={box}>
      <h3 className="text-sm font-bold">유료 전환</h3>
      <input type="hidden" name="shop_id" value={shopId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          청구 시작일
          <input type="date" name="starts_on" required defaultValue={startsOn} className={input} />
        </label>
        <label className="text-sm font-medium">
          청구 종료일 (마지막 날 포함)
          <input type="date" name="ends_on" required defaultValue={endsOn} className={input} />
        </label>
      </div>
      <Note label="청구 메모 (선택, 샵에는 보이지 않음)" />
      <button disabled={pending} className={primary}>
        {pending ? "전환 중…" : "유료 전환"}
      </button>
      <Status state={state} />
    </form>
  );
}

export function ExtendForm({ shopId, suspended, endsOn }: { shopId: string; suspended: boolean; endsOn: string }) {
  const [state, action, pending] = useAction(extendLicense);
  return (
    <form action={action} aria-label="연장" className={box}>
      <h3 className="text-sm font-bold">{suspended ? "연장하고 다시 켜기" : "연장"}</h3>
      <input type="hidden" name="shop_id" value={shopId} />
      <label className="text-sm font-medium">
        새 종료일 (마지막 날 포함)
        <input type="date" name="ends_on" required defaultValue={endsOn} className={input} />
      </label>
      {suspended && <p className="text-xs text-ink-muted">중지된 사용권을 다시 켭니다. AI 자동 응대는 사장님이 설정 화면에서 다시 켭니다.</p>}
      <Note />
      <button disabled={pending} className={primary}>
        {pending ? "저장 중…" : suspended ? "연장하고 다시 켜기" : "연장"}
      </button>
      <Status state={state} />
    </form>
  );
}

export function SuspendForm({ shopId, shopName }: { shopId: string; shopName: string }) {
  const [state, action, pending] = useAction(suspendLicense);
  const [asking, setAsking] = useState(false);
  return (
    <form action={action} aria-label="중지" className={box}>
      <h3 className="text-sm font-bold">중지</h3>
      <input type="hidden" name="shop_id" value={shopId} />
      <label className="text-sm font-medium">
        중지 이유
        <select name="reason" defaultValue="admin" className={input}>
          {SUSPEND_REASONS.map((r) => (
            <option key={r} value={r}>
              {SUSPEND_REASON_LABEL[r]}
            </option>
          ))}
        </select>
      </label>
      <Note />
      {asking ? (
        <div role="group" aria-label="중지 확인" className="flex flex-col gap-2 rounded-[10px] bg-[#FDECEC] p-3">
          <p className="text-sm">{shopName}의 AI 상담을 중지할까요? 자동응답이 바로 꺼지고 샵에 알림이 갑니다.</p>
          <div className="flex flex-wrap gap-2">
            <button name="confirm" value="yes" disabled={pending} className="min-h-11 rounded-[10px] bg-danger px-4 text-sm font-medium text-white disabled:opacity-60">
              {pending ? "중지 중…" : "중지 확정"}
            </button>
            <button type="button" onClick={() => setAsking(false)} className="min-h-11 rounded-[10px] border border-line px-4 text-sm">
              취소
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAsking(true)} className="min-h-11 rounded-[10px] border border-danger px-4 text-sm font-medium text-danger">
          중지…
        </button>
      )}
      <Status state={state} />
    </form>
  );
}

export function PackForm({ shopId, months, packInfo }: { shopId: string; months: [string, string]; packInfo: string }) {
  const [state, action, pending] = useAction(addPack);
  return (
    <form action={action} aria-label="팩 추가" className={box}>
      <h3 className="text-sm font-bold">팩 추가</h3>
      <input type="hidden" name="shop_id" value={shopId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          달
          <select name="month" defaultValue={months[0]} className={input}>
            <option value={months[0]}>이번 달 ({months[0]})</option>
            <option value={months[1]}>다음 달 ({months[1]})</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          팩 수
          <input type="number" name="count" min={1} max={20} step={1} defaultValue={1} required className={input} />
        </label>
      </div>
      <p className="text-xs text-ink-muted">{packInfo} 팩은 그 달에만 씁니다.</p>
      <button disabled={pending} className={primary}>
        {pending ? "추가 중…" : "팩 추가"}
      </button>
      <Status state={state} />
    </form>
  );
}

export function QuotaForm({ shopId, included, dailyCap, defaultCap }: { shopId: string; included: number; dailyCap: number | null; defaultCap: number | null }) {
  const [state, action, pending] = useAction(setQuota);
  return (
    <form action={action} aria-label="포함량·하루 상한" className={box}>
      <h3 className="text-sm font-bold">포함량·하루 상한 조정</h3>
      <input type="hidden" name="shop_id" value={shopId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          월 포함 응답 (건)
          <input type="number" name="included" min={1} max={1000000} step={1} defaultValue={included} required className={input} />
        </label>
        <label className="text-sm font-medium">
          하루 상한 (회, 비우면 기본{defaultCap ? ` ${defaultCap}회` : ""})
          <input type="number" name="daily_cap" min={1} max={10000} step={1} defaultValue={dailyCap ?? ""} className={input} />
        </label>
      </div>
      <button disabled={pending} className={primary}>
        {pending ? "저장 중…" : "포함량·상한 저장"}
      </button>
      <Status state={state} />
    </form>
  );
}

export type PlanDefaults = {
  id: string;
  code: string;
  name: string;
  monthly_price_krw: number;
  included_monthly_responses: number;
  overage_policy: string;
  pack_size: number;
  pack_price_krw: number;
  trial_days: number;
  trial_wait_days: number;
  expiry_notice_days: number;
};

export function PlanForm({ current }: { current: PlanDefaults | null }) {
  const [state, action, pending] = useAction(createPlan);
  const num = (name: string, label: string, v: number | undefined, min: number, max: number) => (
    <label className="text-sm font-medium">
      {label}
      <input type="number" name={name} min={min} max={max} step={1} defaultValue={v ?? ""} required className={input} />
    </label>
  );
  return (
    <form action={action} aria-label="새 요금제" className={box}>
      <p className="text-xs text-ink-muted">가격·포함량을 바꿀 때는 새 요금제를 만듭니다. 이미 부여한 사용권은 부여 때 값을 그대로 씁니다. 부가세는 별도로 기록됩니다.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          코드 (영문 소문자·숫자·밑줄)
          <input name="code" required maxLength={40} pattern="[a-z0-9_]{1,40}" className={input} />
        </label>
        <label className="text-sm font-medium">
          이름
          <input name="name" required maxLength={60} defaultValue={current?.name ?? ""} className={input} />
        </label>
        {num("monthly_price_krw", "월 요금 (원, 부가세 별도)", current?.monthly_price_krw, 0, 100000000)}
        {num("included", "월 포함 응답 (건)", current?.included_monthly_responses, 1, 1000000)}
        <label className="text-sm font-medium">
          초과 정책
          <select name="overage_policy" defaultValue={current?.overage_policy ?? "block"} className={input}>
            <option value="block">자동응답 중지 → 사장님께 넘김</option>
            <option value="allow">초과 허용(나중에 청구)</option>
          </select>
        </label>
        {num("pack_size", "팩 크기 (건)", current?.pack_size, 1, 1000000)}
        {num("pack_price_krw", "팩 가격 (원)", current?.pack_price_krw, 0, 100000000)}
        {num("trial_days", "체험 (일)", current?.trial_days, 1, 90)}
        {num("trial_wait_days", "체험 대기 (일)", current?.trial_wait_days, 1, 90)}
        {num("expiry_notice_days", "만료 알림 (며칠 전)", current?.expiry_notice_days, 0, 30)}
      </div>
      {current && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="retire_plan_id" value={current.id} defaultChecked className="size-5" />
          지금 요금제({current.code})는 새 부여에 쓰지 않기
        </label>
      )}
      <button disabled={pending} className={primary}>
        {pending ? "만드는 중…" : "새 요금제 만들기"}
      </button>
      <Status state={state} />
    </form>
  );
}

// 사용권 표의 체크·고르기 필터는 서버 GET 폼(page.tsx)이라 여기 없다.
