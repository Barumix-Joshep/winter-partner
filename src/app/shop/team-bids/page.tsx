import { Suspense } from "react";
import { PriceReference } from "@/components/price-reference";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shop/my-shop";
import { formatLessonTime } from "@/lib/shop/job-status";
import { LESSON_TYPES, PATCH_PAID_BY, type LessonType, type PatchPaidBy } from "@/lib/shop/job";
import { kstLocalInput } from "@/lib/shop/bid";
import { requestTime } from "@/lib/time";
import { withdrawTeamBid } from "./actions";
import { AssignMemberForm, TeamBidForm } from "./forms";

// 2단계 팀 입찰 (강습팀 전용): 팀 입찰을 허용한 다른 샵 공고에 팀 이름으로 입찰하고, 선정되면 팀원을 지정한다.
export default function TeamBidsPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">팀 입찰</h1>
        <p className="mt-1 text-sm text-ink-muted">
          팀 입찰을 받는 공고에 팀으로 금액을 제시합니다. 선정되면 우리 팀 전속 강사 중 한 명을 지정하고, 정산은 팀으로 받습니다(원천세 없음).
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <TeamBids />
      </Suspense>
    </div>
  );
}

type Job = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
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

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

async function TeamBids() {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/shop/new");
  if (shop.type !== "lesson_team") {
    return <p className="rounded-[14px] border border-line bg-white p-5 text-sm text-ink-muted">팀 입찰은 강습팀만 할 수 있습니다.</p>;
  }
  if (shop.status !== "approved") {
    return <p className="rounded-[14px] border border-[#F3D4A8] bg-[#FFF1E0] p-4 text-sm text-[#7A3E06]">본사 승인 뒤에 팀 입찰을 할 수 있습니다.</p>;
  }

  const supabase = await createClient();
  const now = new Date(await requestTime()).toISOString();
  const jobCols = "id, starts_at, ends_at, status, lesson_type, instructor_rate, patch_paid_by, bid_closes_at, note, resort_id, sports(name), resorts(name), shops(name)";
  const [{ data: open }, { data: myBids }, { data: mine }, { data: members }] = await Promise.all([
    // RLS: 팀 입찰을 허용한 열린 공고만 강습팀에게 보인다
    supabase.from("jobs").select(jobCols).eq("status", "open").eq("assign_mode", "bid").eq("allow_team_bids", true).neq("shop_id", shop.id).gt("bid_closes_at", now).order("starts_at"),
    supabase.from("bids").select("job_id, amount, memo").eq("bidder_shop_id", shop.id).eq("status", "open"),
    supabase
      .from("assignments")
      .select(`job_id, instructor_id, final_rate, completed_at, instructors(profiles(name)), jobs!inner(${jobCols})`)
      .eq("via_shop_id", shop.id)
      .in("jobs.status", ["assigned", "done", "approved"])
      .gte("jobs.ends_at", new Date(Date.parse(now) - 7 * 86400_000).toISOString()),
    supabase.from("shop_instructors").select("instructor_id, instructors(profiles(name))").eq("shop_id", shop.id),
  ]);

  const resortIds = new Set(shop.resorts.map((r) => r.id));
  const list = ((open ?? []) as unknown as Job[]).filter((j) => resortIds.has(j.resort_id));
  const bids = new Map((myBids ?? []).map((b) => [b.job_id as string, { amount: b.amount as number, memo: b.memo as string | null }]));
  const team = ((members ?? []) as unknown as { instructor_id: string; instructors: { profiles: { name: string } | null } | null }[]).map((m) => ({
    id: m.instructor_id,
    name: m.instructors?.profiles?.name ?? "강사",
  }));
  const assigned = ((mine ?? []) as unknown as {
    job_id: string;
    instructor_id: string | null;
    final_rate: number;
    completed_at: string | null;
    instructors: { profiles: { name: string } | null } | null;
    jobs: Job;
  }[]).sort((a, b) => a.jobs.starts_at.localeCompare(b.jobs.starts_at));

  return (
    <>
      <section>
        <h2 className="text-base font-bold">우리 팀이 맡은 강습 {assigned.length}건</h2>
        {team.length === 0 && (
          <p className="mt-2 text-sm text-danger">전속 강사(팀원)가 없어 지정할 수 없습니다. 전속 강사 메뉴에서 먼저 팀원을 등록해 주세요.</p>
        )}
        {assigned.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">선정된 강습이 없습니다.</p>
        ) : (
          <ul className="mt-2 grid gap-2 md:grid-cols-2">
            {assigned.map((a) => (
              <li key={a.job_id} className="rounded-[14px] border border-line bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[15px] font-bold">
                    {formatLessonTime(a.jobs.starts_at, a.jobs.ends_at)} · {a.jobs.sports?.name} {LESSON_TYPES[a.jobs.lesson_type].label}
                  </p>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                      a.instructor_id ? "bg-[#E3EBFF] text-brand" : "bg-[#FFF1E0] text-[#B4560A]"
                    }`}
                  >
                    {a.completed_at ? "완료 보고" : a.instructor_id ? "팀원 지정됨" : "팀원 지정 필요"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {a.jobs.shops?.name} · {a.jobs.resorts?.name} · 확정 {won(a.final_rate)}
                </p>
                {a.jobs.note && <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-xs">요청 사항 · {a.jobs.note}</p>}
                {a.instructor_id && <p className="mt-2 text-sm font-medium text-brand">맡은 팀원: {a.instructors?.profiles?.name}</p>}
                {!a.completed_at && a.jobs.status === "assigned" && <AssignMemberForm jobId={a.job_id} members={team} current={a.instructor_id} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-base font-bold">팀 입찰 받는 공고 {list.length}건</h2>
        <p className="mt-1 text-xs text-ink-muted">우리 영업 스키장({shop.resorts.map((r) => r.name).join(" · ") || "없음"})의 공고만 보입니다.</p>
        {list.length === 0 ? (
          <p className="mt-2 rounded-[14px] border border-line bg-white p-5 text-sm text-ink-muted">지금 열린 공고가 없습니다.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-3">
            {list.map((j) => {
              const current = bids.get(j.id) ?? null;
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
                    상한 <strong className="text-ink">{won(j.instructor_rate)}</strong>
                    {j.bid_closes_at ? ` · 마감 ${kstLocalInput(j.bid_closes_at).replace("T", " ")}` : ""}
                  </p>
                  {j.note && <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-xs">요청 사항 · {j.note}</p>}
                  <PriceReference jobId={j.id} />
                  <TeamBidForm jobId={j.id} ceiling={j.instructor_rate} current={current} />
                  {current && (
                    <form action={withdrawTeamBid} className="mt-1 text-right">
                      <input type="hidden" name="job_id" value={j.id} />
                      <button className="min-h-11 px-2 text-xs text-ink-muted">입찰 철회</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
