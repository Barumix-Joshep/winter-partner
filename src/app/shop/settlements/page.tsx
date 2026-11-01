import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shop/my-shop";
import { todayKst } from "@/lib/instructor/schedule";
import { formatLessonTime } from "@/lib/shop/job-status";
import { LESSON_TYPES, type LessonType } from "@/lib/shop/job";
import { requestTime } from "@/lib/time";
import { generate, issue, setPaid } from "./actions";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function SettlementsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">정산</h1>
        <p className="mt-1 text-sm text-ink-muted">
          그 달에 승인한 강습의 확정 금액으로 강사·팀별 정산을 냅니다. 개인 강사는 3.3%를 원천징수합니다. 발행하면 금액이 확정되고, 송금은 직접 하신 뒤
          지급 완료로 표시합니다.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <Settlements searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "집계됨", cls: "bg-[#EEF1F6] text-ink-muted" },
  issued: { label: "정산서 발행", cls: "bg-[#E3EBFF] text-brand" },
  paid: { label: "지급 완료", cls: "bg-[#E6F4EA] text-[#1B6B3A]" },
};

type Row = {
  id: string;
  gross: number;
  withholding: number;
  net: number;
  status: string;
  instructors: { profiles: { name: string } | null } | null;
  shops: { name: string } | null;
  settlement_items: { amount: number; assignments: { jobs: { starts_at: string; ends_at: string; lesson_type: LessonType; sports: { name: string } | null } | null } | null }[];
};

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const shiftMonth = (m: string, d: number) => {
  const [y, mo] = m.split("-").map(Number);
  const t = new Date(Date.UTC(y, mo - 1 + d, 1));
  return t.toISOString().slice(0, 7);
};

async function Settlements({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/shop/new");
  const q = (await searchParams).month;
  const month = typeof q === "string" && /^\d{4}-\d{2}$/.test(q) ? q : todayKst(await requestTime()).slice(0, 7);

  const supabase = await createClient();
  const { data } = await supabase
    .from("settlements")
    .select(
      "id, gross, withholding, net, status, instructors(profiles(name)), shops!settlements_payee_shop_id_fkey(name), settlement_items(amount, assignments(jobs(starts_at, ends_at, lesson_type, sports(name))))",
    )
    .eq("shop_id", shop.id)
    .eq("month", `${month}-01`);
  const rows = ((data ?? []) as unknown as Row[]).sort((a, b) => b.gross - a.gross);
  const total = rows.reduce((s, r) => ({ gross: s.gross + r.gross, wh: s.wh + r.withholding, net: s.net + r.net }), { gross: 0, wh: 0, net: 0 });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/shop/settlements?month=${shiftMonth(month, -1)}`} className="flex min-h-11 items-center px-2 text-ink-muted">‹</Link>
          <span className="text-base font-bold">{Number(month.slice(0, 4))}년 {Number(month.slice(5))}월</span>
          <Link href={`/shop/settlements?month=${shiftMonth(month, 1)}`} className="flex min-h-11 items-center px-2 text-ink-muted">›</Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {rows.length > 0 && (
            <a href={`/shop/settlements/export?month=${month}`} className="flex min-h-11 items-center rounded-[10px] border border-line bg-white px-4 text-sm font-medium">
              Excel 내려받기
            </a>
          )}
          {rows.some((r) => r.status === "draft") && (
            <form action={issue}>
              <input type="hidden" name="month" value={month} />
              <button className="min-h-11 rounded-[10px] border border-brand bg-white px-4 text-sm font-medium text-brand">정산서 발행</button>
            </form>
          )}
          <form action={generate}>
            <input type="hidden" name="month" value={month} />
            <button className="min-h-11 rounded-[10px] bg-brand px-5 text-sm font-medium text-white">{rows.length ? "다시 집계" : "이 달 정산 집계"}</button>
          </form>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-[14px] border border-line bg-white p-5 text-sm text-ink-muted">
          아직 집계하지 않았거나 이 달 승인한 강습이 없습니다. 완료 보고를 승인한 뒤 집계해 주세요.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="강습료 지급 합계" value={won(total.gross)} />
            <Stat label="원천징수 (3.3%)" value={won(total.wh)} />
            <Stat label="실지급 합계" value={won(total.net)} />
          </div>
          <ul className="flex flex-col gap-2">
            {rows.map((r) => {
              const s = STATUS[r.status];
              const name = r.shops?.name ? `${r.shops.name} (팀)` : (r.instructors?.profiles?.name ?? "—");
              return (
                <li key={r.id} className="rounded-[14px] border border-line bg-white">
                  <details>
                    <summary className="grid cursor-pointer grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 p-4 sm:grid-cols-[1.2fr_repeat(3,1fr)_auto]">
                      <span className="font-bold">
                        {name} <span className="text-xs font-normal text-ink-muted">{r.settlement_items.length}건</span>
                      </span>
                      <span className={`justify-self-end rounded-full px-2.5 py-1 text-xs font-medium sm:order-last ${s.cls}`}>{s.label}</span>
                      <span className="text-sm text-ink-muted">총액 {won(r.gross)}</span>
                      <span className="text-sm text-ink-muted">원천세 {won(r.withholding)}</span>
                      <span className="text-sm font-bold">실지급 {won(r.net)}</span>
                    </summary>
                    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#EEF1F6] px-4 pt-2">
                      {r.status !== "draft" && (
                        <form action={setPaid}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="paid" value={r.status === "paid" ? "false" : "true"} />
                          <button
                            className={`min-h-11 rounded-[10px] px-4 text-sm font-medium ${
                              r.status === "paid" ? "text-ink-muted" : "bg-[#1B6B3A] text-white"
                            }`}
                          >
                            {r.status === "paid" ? "지급 완료 취소" : `${won(r.net)} 송금했어요 · 지급 완료`}
                          </button>
                        </form>
                      )}
                      {r.status === "draft" && <span className="text-xs text-ink-muted">발행하면 지급 완료로 표시할 수 있습니다</span>}
                      <a href={`/settlements/${r.id}/pdf`} className="flex min-h-11 items-center text-sm font-medium text-brand">
                        정산서 PDF
                      </a>
                    </div>
                    <ul className="px-4 pb-2 text-sm">
                      {r.settlement_items
                        .map((i) => ({ ...i, job: i.assignments?.jobs }))
                        .sort((a, b) => (a.job?.starts_at ?? "").localeCompare(b.job?.starts_at ?? ""))
                        .map((i, k) => (
                          <li key={k} className="flex justify-between py-1.5">
                            <span>
                              {i.job ? formatLessonTime(i.job.starts_at, i.job.ends_at) : ""} {i.job?.sports?.name}{" "}
                              {i.job ? LESSON_TYPES[i.job.lesson_type].label : ""}
                            </span>
                            <span>{won(i.amount)}</span>
                          </li>
                        ))}
                    </ul>
                  </details>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-1 text-lg font-bold sm:text-xl">{value}</p>
    </div>
  );
}
