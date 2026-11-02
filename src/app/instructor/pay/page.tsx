import { Suspense } from "react";
import Link from "next/link";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyInstructorId } from "@/lib/instructor/profile";
import { todayKst } from "@/lib/instructor/schedule";
import { monthWindowKst } from "@/lib/shop/today";
import { formatLessonTime } from "@/lib/shop/job-status";
import { LESSON_TYPES, type LessonType } from "@/lib/shop/job";
import { instructorMonth } from "@/lib/settlement/instructor-month";
import { payTypeOf } from "@/lib/settlement/pay-type";
import { requestTime } from "@/lib/time";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function PayPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <Pay searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

type A = {
  final_rate: number;
  via_shop_id: string | null; // 팀 강습: 팀이 정산받는다. 금액은 팀 몫이라 보이지 않는다
  jobs: { id: string; starts_at: string; ends_at: string; status: string; lesson_type: LessonType; canceled_by: string | null; sports: { name: string } | null; shops: { id: string; name: string } | null };
};

const won = (n: number) => n.toLocaleString("ko-KR");
const shiftMonth = (m: string, d: number) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1 + d, 1)).toISOString().slice(0, 7);
};
const ITEM_STATE: Record<string, { label: string; cls: string }> = {
  approved: { label: "승인 완료", cls: "text-[#1B6B3A]" },
  done: { label: "승인 대기", cls: "text-[#B4560A]" },
  assigned: { label: "강습 예정·보고 전", cls: "text-ink-muted" },
  canceled: { label: "정산 제외", cls: "text-ink-muted" },
};
const SHOP_STATE: Record<string, string> = {
  "지급 완료": "bg-[#E6F4EA] text-[#1B6B3A]",
  "지급 대기": "bg-[#FFF1E0] text-[#B4560A]",
  집계됨: "bg-[#E3EBFF] text-brand",
  "집계 전": "bg-[#EEF1F6] text-ink-muted",
};

async function Pay({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireArea("instructor");
  const me = await getMyInstructorId(user.id);
  const q = (await searchParams).month;
  const month = typeof q === "string" && /^\d{4}-\d{2}$/.test(q) ? q : todayKst(await requestTime()).slice(0, 7);
  const win = monthWindowKst(`${month}-01`);

  const supabase = await createClient();
  const [{ data: lessons }, { data: sts }, { data: mine }] = await Promise.all([
    supabase
      .from("instructor_assignments")
      .select("final_rate, via_shop_id, jobs!inner(id, starts_at, ends_at, status, lesson_type, canceled_by, sports(name), shops(id, name))")
      .eq("instructor_id", me ?? "")
      .gte("jobs.starts_at", win.from)
      .lt("jobs.starts_at", win.to),
    supabase.from("settlements").select("id, shop_id, gross, withholding, net, status").eq("instructor_id", me ?? "").eq("month", `${month}-01`),
    supabase.from("shop_instructors").select("shop_id, pay_type").eq("instructor_id", me ?? ""),
  ]);
  const rows = ((lessons ?? []) as unknown as A[]).sort((a, b) => b.jobs.starts_at.localeCompare(a.jobs.starts_at));
  const m = instructorMonth(
    rows.filter((r) => !r.via_shop_id).map((r) => ({ amount: r.final_rate, status: r.jobs.status, shop: r.jobs.shops ?? { id: "", name: "" } })),
    (sts ?? []).map((s) => ({ id: s.id, shopId: s.shop_id, gross: s.gross, withholding: s.withholding, net: s.net, status: s.status })),
    new Set((mine ?? []).filter((x) => payTypeOf(x.pay_type, false).byShop).map((x) => x.shop_id as string)),
  );
  const mo = Number(month.slice(5));

  return (
    <>
      <section className="flex flex-col gap-3 rounded-[14px] bg-navy p-4 text-white">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">정산</h1>
          <div className="flex items-center gap-1 text-sm">
            <Link href={`/instructor/pay?month=${shiftMonth(month, -1)}`} className="flex min-h-11 items-center px-2 text-navy-muted">‹</Link>
            <span>{mo}월</span>
            <Link href={`/instructor/pay?month=${shiftMonth(month, 1)}`} className="flex min-h-11 items-center px-2 text-navy-muted">›</Link>
          </div>
        </div>
        <div>
          <p className="text-xs text-navy-muted">{mo}월 확정 강습료 · 원천세 전</p>
          <p className="text-3xl font-bold">
            {won(m.total.gross)}
            <span className="text-base font-normal">원</span>
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Box label="승인 완료" value={`${m.total.approvedCount}건`} />
          <Box label="원천세 3.3%" value={m.total.withholding ? `-${won(m.total.withholding)}` : "0"} />
          <Box label="실지급 예정" value={won(m.total.net)} accent />
        </div>
      </section>

      <h2 className="text-[15px] font-bold">샵별 정산</h2>
      {m.shops.length === 0 && <p className="text-sm text-ink-muted">이 달 강습이 없습니다.</p>}
      {m.shops.map((s) => (
        <article key={s.shopId} className="flex flex-col gap-2 rounded-[14px] border border-line bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[15px] font-bold">{s.name}</p>
              {s.pending > 0 && <p className="text-xs text-ink-muted">승인 대기 {s.pending}건은 승인되면 더해집니다</p>}
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${SHOP_STATE[s.state] ?? ""}`}>{s.state}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-ink-muted">{s.count}건 · 실지급</span>
            <span className="text-lg font-bold">{won(s.net)}원</span>
          </div>
          {s.settlementId && (
            <a href={`/settlements/${s.settlementId}/pdf`} className="flex min-h-11 items-center self-end text-xs font-medium text-brand">
              정산서 PDF
            </a>
          )}
        </article>
      ))}

      {rows.length > 0 && (
        <>
          <h2 className="mt-1 text-[15px] font-bold">강습 건</h2>
          <div className="rounded-[14px] border border-line bg-white px-4">
            {rows.map((r) => {
              const st = ITEM_STATE[r.jobs.status] ?? ITEM_STATE.assigned;
              const excluded = r.jobs.status === "canceled";
              return (
                <div key={r.jobs.id} className="flex items-center justify-between border-b border-[#EEF1F6] py-3 last:border-b-0">
                  <div>
                    <p className="text-[13px] font-medium">
                      {formatLessonTime(r.jobs.starts_at, r.jobs.ends_at).split(" ")[0]} {r.jobs.sports?.name} {LESSON_TYPES[r.jobs.lesson_type].label} ·{" "}
                      {r.jobs.shops?.name}
                    </p>
                    {excluded && <p className="text-[11px] text-ink-muted">{r.jobs.canceled_by === "shop" ? "샵 사정 취소" : "손님 취소"}</p>}
                  </div>
                  <div className={`text-right ${st.cls}`}>
                    <p className="text-sm font-bold">{r.via_shop_id ? "팀 정산" : `${excluded ? "0" : won(r.final_rate)}원`}</p>
                    <p className="text-[11px]">{st.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      <p className="text-[11px] leading-5 text-ink-muted">
        정산서는 샵이 달마다 발행합니다. 지급은 각 샵이 직접 송금하고, 샵이 지급 완료로 표시하면 여기에 나옵니다.
      </p>
    </>
  );
}

function Box({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-[10px] bg-navy-2 px-3 py-2.5">
      <p className="text-[11px] text-navy-muted">{label}</p>
      <p className={`text-base font-bold ${accent ? "text-[#8FD3A6]" : ""}`}>{value}</p>
    </div>
  );
}
