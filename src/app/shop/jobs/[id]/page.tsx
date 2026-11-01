import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shop/my-shop";
import { formatLessonTime, jobStatusLabel } from "@/lib/shop/job-status";
import { LESSON_TYPES, PATCH_PAID_BY, type LessonType, type PatchPaidBy } from "@/lib/shop/job";
import { sendOffer } from "./actions";
import { PublishForm } from "./publish-form";
import { defaultBidClose, kstLocalInput } from "@/lib/shop/bid";

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="flex flex-col gap-5">
      <Link href="/shop/jobs" className="text-sm text-ink-muted">
        ‹ 강습 목록
      </Link>
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <Job params={params} />
      </Suspense>
    </div>
  );
}

const OFFER_LABEL: Record<string, string> = { pending: "응답 대기", accepted: "수락", declined: "거절", expired: "만료" };

async function Job({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/shop/new");
  const supabase = await createClient();
  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id, shop_id, resort_id, sport_id, starts_at, ends_at, status, assign_mode, lesson_type, student_count, instructor_rate, patch_paid_by, note, sports(name), resorts(name), job_prices(customer_price), job_customers(customers(name, phone, level)), bid_closes_at, allow_team_bids, job_offers(id, status, expires_at, responded_at, instructors(profiles(name))), assignments(final_rate, instructors(profiles(name))), bids(id, amount, memo, status, created_at, bidder_type, instructors(profiles(name)), shops!bids_bidder_shop_id_fkey(name))",
    )
    .eq("id", id)
    .eq("shop_id", shop.id)
    .maybeSingle();
  if (!job) notFound();

  const j = job as unknown as {
    id: string;
    resort_id: number;
    sport_id: number;
    starts_at: string;
    ends_at: string;
    status: string;
    assign_mode: string;
    lesson_type: LessonType;
    student_count: number;
    instructor_rate: number | null;
    patch_paid_by: PatchPaidBy | null;
    note: string | null;
    sports: { name: string } | null;
    resorts: { name: string } | null;
    job_prices: { customer_price: number | null } | null;
    job_customers: { customers: { name: string; phone: string | null; level: string | null } | null }[];
    job_offers: { id: string; status: string; expires_at: string | null; instructors: { profiles: { name: string } | null } | null }[];
    assignments: { final_rate: number; instructors: { profiles: { name: string } | null } | null } | null;
    bid_closes_at: string | null;
    allow_team_bids: boolean;
    bids: {
      id: string;
      amount: number;
      memo: string | null;
      status: string;
      bidder_type: string;
      instructors: { profiles: { name: string } | null } | null;
      shops: { name: string } | null;
    }[];
  };
  const s = jobStatusLabel(j);
  const canOffer = j.status === "draft" || (j.status === "open" && j.assign_mode === "direct");
  const won = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("ko-KR")}원`);

  return (
    <>
      <section className="rounded-[14px] border border-line bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">
              {formatLessonTime(j.starts_at, j.ends_at)} · {j.sports?.name} {LESSON_TYPES[j.lesson_type].label}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              {j.resorts?.name} · {j.student_count}명 · 패치 {j.patch_paid_by ? PATCH_PAID_BY[j.patch_paid_by] : "미정"}
            </p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${s.cls}`}>{s.label}</span>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-ink-muted">손님</dt>
            <dd>
              {j.job_customers.map((c, i) => (
                <span key={i} className="block">
                  {c.customers?.name}
                  {c.customers?.level ? ` (${c.customers.level})` : ""} {c.customers?.phone ?? ""}
                </span>
              ))}
              {j.job_customers.length === 0 && "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">손님 강습료</dt>
            <dd>{won(j.job_prices?.customer_price)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">강사 지급액</dt>
            <dd>{won(j.assignments?.final_rate ?? j.instructor_rate)}</dd>
          </div>
        </dl>
        {j.note && <p className="mt-3 rounded-lg bg-surface p-3 text-sm">요청 사항 · {j.note}</p>}
        {j.assignments && (
          <p className="mt-3 text-sm font-medium text-brand">배정: {j.assignments.instructors?.profiles?.name}</p>
        )}
      </section>

      {j.job_offers.length > 0 && (
        <section>
          <h2 className="text-base font-bold">의뢰 기록</h2>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {j.job_offers.map((o) => (
              <li key={o.id} className="flex justify-between rounded-lg border border-line bg-white px-4 py-2.5">
                <span>{o.instructors?.profiles?.name}</span>
                <span className="text-ink-muted">{OFFER_LABEL[o.status]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {j.assign_mode === "bid" && j.status !== "draft" && <Bids job={j} />}

      {j.status === "draft" && (
        <section>
          <h2 className="text-base font-bold">입찰 공고</h2>
          <div className="mt-2">
            <PublishForm jobId={j.id} defaultClose={defaultBidClose(j.starts_at)} ceiling={j.instructor_rate} />
          </div>
        </section>
      )}

      {canOffer && (
        <Candidates shopId={shop.id} job={j} />
      )}
    </>
  );
}

type Candidate = { instructor_id: string; name: string; is_mine: boolean; certs: string[]; rating: number | null; base_rate: number | null };

// 이 강습 시간에 가능한 강사 (우리 전속 먼저). 직접 의뢰는 한 번에 한 명.
async function Candidates({ shopId, job }: { shopId: string; job: { id: string; resort_id: number; sport_id: number; starts_at: string; ends_at: string; instructor_rate: number | null } }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("search_instructors", {
    p_shop_id: shopId,
    p_resort_id: job.resort_id,
    p_sport_id: job.sport_id,
    p_from: job.starts_at,
    p_to: job.ends_at,
  });
  const rows = (data ?? []) as Candidate[];
  return (
    <section>
      <h2 className="text-base font-bold">직접 의뢰</h2>
      <p className="mt-1 text-sm text-ink-muted">
        이 시간에 가능 일정을 올린 강사입니다. 의뢰는 24시간(또는 강습 시작 전)까지 유효하고, 새로 보내면 이전 의뢰는 만료됩니다.
      </p>
      {job.instructor_rate == null && (
        <p className="mt-2 text-sm text-danger">강사 지급액이 없어 의뢰할 수 없습니다. 강습을 새로 등록해 금액을 넣어 주세요.</p>
      )}
      {rows.length === 0 ? (
        <p className="mt-2 rounded-[14px] border border-line bg-white p-4 text-sm text-ink-muted">
          이 시간에 가능한 강사가 없습니다. 입찰 공고를 이용해 보세요.
        </p>
      ) : (
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {rows.map((r) => (
            <li key={r.instructor_id} className="flex items-center justify-between gap-3 rounded-[14px] border border-line bg-white p-4">
              <div className="min-w-0">
                <p className="text-sm font-bold">
                  {r.name} <span className="text-xs font-normal text-ink-muted">{r.is_mine ? "전속" : "프리랜서"}</span>
                </p>
                <p className="truncate text-xs text-ink-muted">
                  {r.certs.join(" · ") || "자격 확인 전"} · {r.rating ? `평점 ${r.rating}` : "평점 없음"}
                </p>
              </div>
              <form action={sendOffer}>
                <input type="hidden" name="job_id" value={job.id} />
                <input type="hidden" name="instructor_id" value={r.instructor_id} />
                <button
                  disabled={job.instructor_rate == null}
                  className="min-h-11 rounded-lg border-[1.5px] border-brand px-3.5 text-[13px] font-medium text-brand disabled:opacity-50"
                >
                  의뢰 보내기
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type BidJob = {
  bid_closes_at: string | null;
  allow_team_bids: boolean;
  instructor_rate: number | null;
  bids: { id: string; amount: number; memo: string | null; status: string; bidder_type: string; instructors: { profiles: { name: string } | null } | null; shops: { name: string } | null }[];
};

// 받은 입찰 (선정·금액 조정은 P4-4)
function Bids({ job }: { job: BidJob }) {
  const open = job.bids.filter((b) => b.status === "open").sort((a, b) => a.amount - b.amount);
  return (
    <section className="rounded-[14px] border border-line bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold">입찰 현황</h2>
        <span className="rounded-full bg-[#FFF1E0] px-2.5 py-1 text-xs font-medium text-[#B4560A]">입찰 {open.length}건</span>
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        상한 {job.instructor_rate?.toLocaleString("ko-KR")}원
        {job.bid_closes_at ? ` · 마감 ${kstLocalInput(job.bid_closes_at).replace("T", " ")}` : ""}
        {job.allow_team_bids ? " · 강습팀 입찰 허용" : ""}
      </p>
      {open.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">아직 입찰이 없습니다.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {open.map((b) => (
            <li key={b.id} className="flex items-center gap-3 rounded-[10px] border border-[#EEF1F6] p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">
                  {b.bidder_type === "shop" ? `${b.shops?.name ?? "강습팀"} (팀)` : b.instructors?.profiles?.name}
                </p>
                {b.memo && <p className="mt-0.5 text-xs text-[#35466A]">{b.memo}</p>}
              </div>
              <p className="text-base font-bold">{b.amount.toLocaleString("ko-KR")}원</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
