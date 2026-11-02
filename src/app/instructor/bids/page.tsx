import { Suspense } from "react";
import { PriceReference } from "@/components/price-reference";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyInstructorId } from "@/lib/instructor/profile";
import { formatLessonTime } from "@/lib/shop/job-status";
import { kstLocalInput } from "@/lib/shop/bid";
import { LESSON_TYPES, PATCH_PAID_BY, type LessonType, type PatchPaidBy } from "@/lib/shop/job";
import { requestTime } from "@/lib/time";
import { BidForm } from "./bid-form";
import { withdrawBid } from "./actions";

export default function BidsPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold">입찰 공고</h1>
        <p className="mt-1 text-sm text-ink-muted">내 활동 스키장의 공고입니다. 상한가 이하로 금액을 제시하면 샵이 골라 확정합니다.</p>
      </div>
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <OpenBids />
      </Suspense>
    </div>
  );
}

type Job = {
  id: string;
  starts_at: string;
  ends_at: string;
  lesson_type: LessonType;
  instructor_rate: number;
  patch_paid_by: PatchPaidBy | null;
  bid_closes_at: string | null;
  note: string | null;
  resort_id: number;
  sports: { name: string } | null;
  resorts: { name: string } | null;
  shops: { name: string } | null;
};

async function OpenBids() {
  const user = await requireArea("instructor");
  const me = await getMyInstructorId(user.id);
  const supabase = await createClient();
  const now = new Date(await requestTime()).toISOString();
  const [{ data: exclusive }, { data: myResorts }, { data: jobs }, { data: myBids }] = await Promise.all([
    supabase.from("shop_instructors").select("shop_id").eq("instructor_id", me ?? "").maybeSingle(),
    supabase.from("instructor_resorts").select("resort_id").eq("instructor_id", me ?? ""),
    // RLS: 전속 강사에게는 공고가 보이지 않는다
    supabase
      .from("jobs")
      .select("id, starts_at, ends_at, lesson_type, instructor_rate, patch_paid_by, bid_closes_at, note, resort_id, sports(name), resorts(name), shops(name)")
      .eq("status", "open")
      .eq("assign_mode", "bid")
      .gt("bid_closes_at", now)
      .order("starts_at"),
    supabase.from("bids").select("job_id, amount, memo").eq("instructor_id", me ?? "").eq("status", "open"),
  ]);

  if (exclusive) {
    return <p className="rounded-[14px] border border-line bg-white p-5 text-sm text-ink-muted">전속 강사는 입찰 공고를 볼 수 없습니다.</p>;
  }
  const resortIds = new Set((myResorts ?? []).map((r) => r.resort_id as number));
  const list = ((jobs ?? []) as unknown as Job[]).filter((j) => resortIds.size === 0 || resortIds.has(j.resort_id));
  const mine = new Map((myBids ?? []).map((b) => [b.job_id as string, { amount: b.amount as number, memo: b.memo as string | null }]));

  if (list.length === 0) {
    return <p className="rounded-[14px] border border-line bg-white p-5 text-sm text-ink-muted">지금 열린 공고가 없습니다.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {list.map((j) => {
        const current = mine.get(j.id) ?? null;
        return (
          <li key={j.id} className="rounded-[14px] border border-line bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[15px] font-bold">
                {formatLessonTime(j.starts_at, j.ends_at)} · {j.sports?.name} {LESSON_TYPES[j.lesson_type].label}
              </p>
              {current && <span className="rounded-full bg-[#E3EBFF] px-2 py-0.5 text-[11px] font-medium text-brand">입찰함</span>}
            </div>
            <p className="mt-0.5 text-xs text-ink-muted">
              {j.shops?.name} · {j.resorts?.name} · 패치 {j.patch_paid_by ? PATCH_PAID_BY[j.patch_paid_by] : "미정"}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              상한 <strong className="text-ink">{j.instructor_rate.toLocaleString("ko-KR")}원</strong>
              {j.bid_closes_at ? ` · 마감 ${kstLocalInput(j.bid_closes_at).replace("T", " ")}` : ""}
            </p>
            {j.note && <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-xs">요청 사항 · {j.note}</p>}
            <PriceReference jobId={j.id} />
            <BidForm jobId={j.id} ceiling={j.instructor_rate} current={current} />
            {current && (
              <form action={withdrawBid} className="mt-1 text-right">
                <input type="hidden" name="job_id" value={j.id} />
                <button className="min-h-11 px-2 text-xs text-ink-muted">입찰 철회</button>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
