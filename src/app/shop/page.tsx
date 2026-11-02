import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shop/my-shop";
import { todayKst } from "@/lib/instructor/schedule";
import { formatLessonTime } from "@/lib/shop/job-status";
import { LESSON_TYPES, PATCH_PAID_BY, type LessonType, type PatchPaidBy } from "@/lib/shop/job";
import { PHASE_LABEL, dayWindowKst, lessonPhase, monthWindowKst, shiftDate, summarizeDay } from "@/lib/shop/today";
import { requestTime } from "@/lib/time";
import { OnboardingCard } from "./onboarding-card";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function ShopToday({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
      <Today searchParams={searchParams} />
    </Suspense>
  );
}

type Row = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  canceled_by: string | null;
  lesson_type: LessonType;
  student_count: number;
  patch_paid_by: PatchPaidBy | null;
  sports: { name: string } | null;
  job_prices: { customer_price: number | null } | null;
  job_customers: { customers: { name: string; level: string | null; equipment_size: string | null } | null }[];
  assignments: { instructor_id: string | null; instructors: { profiles: { name: string } | null } | null } | null;
};

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const won = (n: number) => n.toLocaleString("ko-KR");

async function Today({ searchParams }: { searchParams: SearchParams }) {
  // 샵이 아직 없는 샵 관리자는 등록부터. 레이아웃 가드와 동시에 돌므로 여기서도 역할을 확인한다.
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/shop/new");

  const now = await requestTime();
  const today = todayKst(now);
  const q = (await searchParams).date;
  const date = typeof q === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : today;
  const day = dayWindowKst(date);
  const month = monthWindowKst(date);
  const soon = { from: new Date(now).toISOString(), to: dayWindowKst(shiftDate(today, 1)).to };

  const supabase = await createClient();
  const [{ data: dayJobs }, { data: monthJobs }, { data: team }, { data: unassigned }, { count: toApprove }] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        "id, starts_at, ends_at, status, canceled_by, lesson_type, student_count, patch_paid_by, sports(name), job_prices(customer_price), job_customers(customers(name, level, equipment_size)), assignments(instructor_id, instructors(profiles(name)))",
      )
      .eq("shop_id", shop.id)
      .gte("starts_at", day.from)
      .lt("starts_at", day.to)
      .order("starts_at"),
    supabase.from("jobs").select("job_prices(customer_price)").eq("shop_id", shop.id).neq("status", "canceled").gte("starts_at", month.from).lt("starts_at", month.to),
    supabase.from("shop_instructors").select("instructor_id").eq("shop_id", shop.id),
    // 지금부터 내일까지 아직 배정 안 된 강습
    supabase.from("jobs").select("id, starts_at, ends_at, status").eq("shop_id", shop.id).in("status", ["draft", "open"]).gte("starts_at", soon.from).lt("starts_at", soon.to).order("starts_at"),
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("shop_id", shop.id).eq("status", "done"),
  ]);

  const rows = (dayJobs ?? []) as unknown as Row[];
  const mineSet = new Set((team ?? []).map((t) => t.instructor_id as string));
  const sum = summarizeDay(
    rows.map((j) => ({
      ...j,
      price: j.job_prices?.customer_price ?? null,
      instructorId: j.assignments?.instructor_id ?? null,
      isMine: mineSet.has(j.assignments?.instructor_id ?? ""),
    })),
    now,
  );
  const monthRevenue = ((monthJobs ?? []) as unknown as { job_prices: { customer_price: number | null } | null }[]).reduce(
    (s, j) => s + (j.job_prices?.customer_price ?? 0),
    0,
  );
  const canceled = rows.filter((j) => j.status === "canceled");
  const needAssign = (unassigned ?? []) as { id: string; starts_at: string; ends_at: string; status: string }[];
  const attention = canceled.length + needAssign.length + (toApprove ?? 0);
  const d = new Date(`${date}T00:00:00Z`);

  return (
    <div className="flex flex-col gap-5">
      <OnboardingCard shopId={shop.id} />
      {shop.status === "pending" && (
        <p className="rounded-[14px] border border-[#F3D4A8] bg-[#FFF1E0] p-4 text-sm text-[#7A3E06]">
          <strong>{shop.name}</strong> 등록을 본사에서 확인하고 있습니다. 승인되면 강사에게 샵이 보입니다.
        </p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {date === today ? "오늘 일정" : "일정"} · {d.getUTCMonth() + 1}/{d.getUTCDate()}({WEEKDAY[d.getUTCDay()]})
          </h1>
          <p className="mt-1 flex gap-3 text-sm text-ink-muted">
            <Link href={`/shop?date=${shiftDate(date, -1)}`} className="flex min-h-11 items-center">‹ 전날</Link>
            {date !== today && <Link href="/shop" className="flex min-h-11 items-center text-brand">오늘</Link>}
            <Link href={`/shop?date=${shiftDate(date, 1)}`} className="flex min-h-11 items-center">다음 날 ›</Link>
          </p>
        </div>
        <Link href="/shop/jobs/new" className="flex min-h-11 items-center rounded-[10px] bg-brand px-5 text-sm font-medium text-white">
          강습 등록
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="강습" value={`${sum.total}`} unit="건" sub={`완료 ${sum.finished} · 진행 ${sum.live} · 예정 ${sum.upcoming}`} />
        <Stat label="배정 강사" value={`${sum.instructors}`} unit="명" sub={`전속 ${sum.mine} · 프리랜서 ${sum.freelance}`} />
        <Stat
          label="확인 필요"
          value={`${attention}`}
          unit="건"
          warn={attention > 0}
          sub={`취소 ${canceled.length} · 미배정 ${needAssign.length} · 승인 ${toApprove ?? 0}`}
        />
        <Stat label="강습료 합계" value={won(sum.revenue)} unit="원" sub={`${d.getUTCMonth() + 1}월 누적 ${won(monthRevenue)}원`} />
      </div>

      {(canceled.length > 0 || needAssign.length > 0 || (toApprove ?? 0) > 0) && (
        <div className="flex flex-col gap-2">
          {canceled.map((j) => (
            <Alert key={j.id} tone="warn" href={`/shop/jobs/${j.id}`} action="확인">
              <strong>{j.canceled_by === "shop" ? "샵 사정 취소" : "손님 취소"}</strong> · {formatLessonTime(j.starts_at, j.ends_at)}{" "}
              {j.job_customers[0]?.customers?.name ?? ""} — 배정 강사에게 알림 발송됨, 정산 제외
            </Alert>
          ))}
          {needAssign.map((j) => (
            <Alert key={j.id} tone="info" href={`/shop/jobs/${j.id}`} action={j.status === "open" ? "상세" : "배정하기"}>
              <strong>{j.status === "open" ? "배정 대기" : "미배정"}</strong> · {formatLessonTime(j.starts_at, j.ends_at)} — 아직 강사가 정해지지
              않았습니다{j.status === "draft" ? " (강사 취소로 돌아온 강습일 수 있습니다)" : ""}.
            </Alert>
          ))}
          {(toApprove ?? 0) > 0 && (
            <Alert tone="info" href="/shop/jobs" action="강습 목록">
              <strong>완료 보고 승인</strong> · 강사가 보고한 강습 {toApprove}건이 승인을 기다립니다. 승인해야 정산에 들어갑니다.
            </Alert>
          )}
        </div>
      )}

      <section className="overflow-hidden rounded-[14px] border border-line bg-white">
        <div className="hidden grid-cols-[5rem_1.4fr_1fr_1fr_6rem_4rem] gap-3 bg-surface px-5 py-3 text-xs font-medium text-ink-muted md:grid">
          <span>시간</span>
          <span>손님 · 강습</span>
          <span>강사</span>
          <span>장비 · 패치</span>
          <span>상태</span>
          <span />
        </div>
        {rows.length === 0 && <p className="p-5 text-sm text-ink-muted">이 날 강습이 없습니다.</p>}
        {rows.map((j) => {
          const p = PHASE_LABEL[lessonPhase(j, now)];
          const cust = j.job_customers.map((c) => c.customers).filter(Boolean);
          const instructorId = j.assignments?.instructor_id;
          return (
            <div
              key={j.id}
              className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-x-3 gap-y-1 border-t border-[#EEF1F6] px-4 py-3 text-sm first:border-t-0 md:grid-cols-[5rem_1.4fr_1fr_1fr_6rem_4rem] md:px-5 md:first:border-t"
            >
              <span className="text-[15px] font-bold">{formatLessonTime(j.starts_at, j.ends_at).split(" ")[1].split("~")[0]}</span>
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {cust.map((c) => `${c!.name}${c!.level ? ` (${c!.level})` : ""}`).join(", ") || "손님 미입력"}
                </span>
                <span className="block text-xs text-ink-muted">
                  {j.sports?.name} {LESSON_TYPES[j.lesson_type].label}
                  {j.lesson_type === "group" ? ` ${j.student_count}명` : ""}
                </span>
              </span>
              <span className={`justify-self-end rounded-full px-2.5 py-1 text-xs font-medium md:order-5 md:justify-self-start ${p.cls}`}>{p.label}</span>
              <span className="col-start-2 text-xs md:order-3 md:col-start-auto md:text-sm">
                {j.assignments?.instructors?.profiles?.name ?? "—"}{" "}
                {instructorId && <span className="text-[11px] text-ink-muted">{mineSet.has(instructorId) ? "전속" : "프리"}</span>}
              </span>
              <span className="col-start-2 text-xs text-[#35466A] md:order-4 md:col-start-auto">
                {cust.map((c) => c!.equipment_size).filter(Boolean).join(", ") || "장비 —"} · 패치{" "}
                {j.patch_paid_by ? PATCH_PAID_BY[j.patch_paid_by] : "미정"}
              </span>
              <Link href={`/shop/jobs/${j.id}`} className="col-start-3 row-start-2 justify-self-end text-xs font-medium text-brand md:order-6 md:col-start-auto md:row-start-auto">
                상세
              </Link>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function Stat({ label, value, unit, sub, warn }: { label: string; value: string; unit: string; sub: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${warn ? "text-[#B4560A]" : ""}`}>
        {value}
        <span className="text-sm font-normal text-ink-muted">{unit}</span>
      </p>
      <p className="text-xs text-ink-muted">{sub}</p>
    </div>
  );
}

function Alert({ tone, href, action, children }: { tone: "warn" | "info"; href: string; action: string; children: React.ReactNode }) {
  const cls = tone === "warn" ? "border-[#F3D4A8] bg-[#FFF1E0] text-[#7A3E06]" : "border-[#BFD0FF] bg-[#E3EBFF] text-brand-dark";
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-[10px] border px-4 py-3 text-sm ${cls}`}>
      <span className="min-w-0 flex-1">{children}</span>
      <Link href={href} className="flex min-h-11 items-center rounded-lg bg-white/70 px-3 text-xs font-medium">
        {action}
      </Link>
    </div>
  );
}
