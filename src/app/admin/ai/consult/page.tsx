import { Suspense } from "react";
import Link from "next/link";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { requestTime } from "@/lib/time";
import { monthLabel, recentMonths } from "@/lib/ai/consult/metrics";
import {
  STATUS_FILTERS,
  applyFilters,
  historyDetail,
  historyLabel,
  kstDateInput,
  licenseRow,
  packMonths,
  parseFilters,
  type Filters,
  type OverviewRow,
  type Tone,
} from "@/lib/ai/consult/license-admin";
import { ExtendForm, GrantForm, PackForm, PaidForm, PlanForm, QuotaForm, SuspendForm, type PlanDefaults } from "./forms";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// 본사: AI 상담 사용권 관리 (P23-3, docs/ai-consult/paid-service-design.md 5절).
// 숫자는 consult_admin_license_overview(본사만, 손님 글·연락처 없음)로만 읽고, 모든 변경은 본사 RPC가 하며 감사 기록을 남긴다.
export default function AdminConsultLicensePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Link href="/admin/ai" className="text-sm text-ink-muted">
        ‹ AI 사용량
      </Link>
      <h1 className="text-lg font-bold">AI 상담 사용권</h1>
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <Licenses searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const won = (n: number | string) => `${Math.round(Number(n)).toLocaleString("ko-KR")}원`;
const cnt = (n: number | string) => Number(n).toLocaleString("ko-KR");
const kstStamp = (iso: string) => {
  const d = new Date(Date.parse(iso) + 9 * 3600_000).toISOString();
  return `${d.slice(0, 10)} ${d.slice(11, 16)}`;
};
const TONE: Record<Tone, string> = {
  none: "bg-[#EEF1F6] text-ink-muted",
  wait: "bg-[#FFF4E5] text-[#8A5300]",
  trial: "bg-[#E8EEFC] text-brand",
  paid: "bg-[#E6F4EA] text-[#1B6B3A]",
  stop: "bg-[#FDECEC] text-danger",
};

type Plan = PlanDefaults & { vat_included: boolean; active: boolean; created_at: string };

function href(f: Filters, shop?: string) {
  const q = new URLSearchParams({ month: f.month });
  if (f.status !== "all") q.set("status", f.status);
  if (f.soon) q.set("soon", "1");
  if (f.over80) q.set("over80", "1");
  if (shop) q.set("shop", shop);
  return `/admin/ai/consult?${q.toString()}${shop ? "#manage" : ""}`;
}

async function Licenses({ searchParams }: { searchParams: SearchParams }) {
  await requireArea("admin");
  const now = await requestTime();
  const sp = await searchParams;
  const f = parseFilters(sp, now);
  const supabase = await createClient();
  const [overview, plansRes, shopsRes] = await Promise.all([
    supabase.rpc("consult_admin_license_overview", { p_month: f.month }),
    supabase.from("consult_plans").select("*").order("created_at", { ascending: false }),
    supabase.from("shops").select("id, name"),
  ]);
  if (overview.error || plansRes.error) {
    return <p className="rounded-xl border border-line bg-white p-4 text-sm text-ink-muted">사용권 표를 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.</p>;
  }
  const all = (overview.data ?? []) as OverviewRow[];
  const plans = (plansRes.data ?? []) as Plan[];
  const activePlans = plans.filter((p) => p.active);
  const planByCode = new Map(plans.map((p) => [p.code, p]));
  const nameOf = new Map(((shopsRes.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  const rows = applyFilters(all, f, now);

  const selectedId = typeof sp.shop === "string" ? sp.shop : null;
  const selected = selectedId ? all.find((r) => r.shop_id === selectedId) ?? null : null;

  const actorIds = [...new Set(all.map((r) => r.updated_by).filter((v): v is string => !!v))];
  const history = selected
    ? await supabase
        .from("audit_events")
        .select("id, action, actor_id, detail, created_at")
        .eq("shop_id", selected.shop_id)
        .like("action", "consult_%")
        .order("created_at", { ascending: false })
        .limit(50)
    : null;
  // 샵별 하루 상한(직접 넣은 값만, 표의 값은 기본값과 합친 것)
  const own = selected?.status ? await supabase.from("consult_licenses").select("daily_cap").eq("shop_id", selected.shop_id).maybeSingle() : null;
  const historyRows = (history?.data ?? []) as { id: string; action: string; actor_id: string | null; detail: Record<string, unknown>; created_at: string }[];
  for (const h of historyRows) if (h.actor_id) actorIds.push(h.actor_id);
  const { data: people } = actorIds.length ? await supabase.from("profiles").select("id, name").in("id", [...new Set(actorIds)]) : { data: [] };
  const personOf = new Map(((people ?? []) as { id: string; name: string | null }[]).map((p) => [p.id, p.name ?? "(이름 없음)"]));

  const licensed = all.filter((r) => r.status).length;

  return (
    <>
      <form method="get" aria-label="사용권 필터" className="flex flex-wrap items-end gap-3 rounded-[14px] border border-line bg-white p-3">
        <label className="text-xs text-ink-muted">
          상태
          <select name="status" defaultValue={f.status} className="mt-1 block min-h-11 rounded-lg border border-line bg-white px-2 text-sm text-ink">
            {STATUS_FILTERS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-muted">
          달
          <select name="month" defaultValue={f.month} className="mt-1 block min-h-11 rounded-lg border border-line bg-white px-2 text-sm text-ink">
            {recentMonths(now, 12).map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="soon" value="1" defaultChecked={f.soon} className="size-5" />7일 안에 끝남
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="over80" value="1" defaultChecked={f.over80} className="size-5" />
          80% 넘음
        </label>
        <button className="min-h-11 rounded-lg bg-brand px-4 text-sm font-medium text-white">보기</button>
      </form>

      <p className="text-sm text-ink-muted">
        샵 {all.length}곳 중 사용권 {licensed}곳 · 보이는 줄 {rows.length}개 · 사용량은 {monthLabel(f.month)}, 상태·날짜는 지금 기준
      </p>

      <div className="overflow-x-auto rounded-[14px] border border-line bg-white">
        <table className="w-full min-w-[78rem] text-left text-sm">
          <caption className="sr-only">AI 상담 사용권 표</caption>
          <thead className="bg-surface text-xs text-ink-muted">
            <tr>
              {["샵", "상태", "시작일", "종료일(마지막 날)", "남은 일수", `응답 / 한도`, "비율", "자동응답", "비용", "1건당", "하루 최대 / 상한", "채널", "마지막 변경", ""].map((h) => (
                <th key={h} className="px-3 py-2.5 font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-t border-[#EEF1F6]">
                <td colSpan={14} className="px-3 py-2.5 text-ink-muted">
                  조건에 맞는 샵이 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const v = licenseRow(r, now);
                const name = nameOf.get(r.shop_id) ?? "(이름 없음)";
                const bar = v.ratio.level === "full" ? "bg-danger" : v.ratio.level === "warn" ? "bg-[#F2994A]" : "bg-brand";
                return (
                  <tr key={r.shop_id} data-shop={r.shop_id} className={`border-t border-[#EEF1F6] ${r.shop_id === selectedId ? "bg-[#F5F8FF]" : ""}`}>
                    <td className="px-3 py-2.5 font-medium">{name}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE[v.label.tone]}`}>{v.label.text}</span>
                      {r.plan_code && <span className="ml-1 text-xs text-ink-muted">{r.plan_code}</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{v.start}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{v.waitUntil ? <span className="text-xs text-ink-muted">대기 끝 {v.waitUntil}</span> : v.end}</td>
                    <td className={`px-3 py-2.5 whitespace-nowrap ${v.soon ? "font-bold text-danger" : ""}`}>{v.daysLeft === null ? "—" : `${v.daysLeft}일`}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {cnt(r.used)} / {v.limit === null ? "—" : cnt(v.limit)}
                      {Number(r.pack_responses) > 0 && <span className="block text-xs text-ink-muted">팩 +{cnt(r.pack_responses)}</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {v.limit === null ? (
                        "—"
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-20 overflow-hidden rounded-full bg-[#EEF1F6]" role="meter" aria-valuenow={v.ratio.percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${name} 사용 비율`}>
                            <div className={`h-full ${bar}`} style={{ width: `${v.ratio.percent}%` }} />
                          </div>
                          <span className={`text-xs ${v.ratio.level === "ok" ? "text-ink-muted" : "font-bold text-danger"}`}>{v.ratio.percent}%</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">{cnt(r.auto_replies)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{won(r.cost_krw)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{v.perResponse}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {cnt(r.daily_max)} / {r.daily_cap === null ? "—" : cnt(r.daily_cap)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                      {[r.kakao_on && "카카오", r.instagram_on && "인스타"].filter(Boolean).join("·") || "—"}
                      {r.auto_reply_on && <span className="block text-[#1B6B3A]">자동응답 켜짐</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                      {r.updated_at ? (
                        <>
                          {r.updated_by ? personOf.get(r.updated_by) ?? "본사" : "시스템"}
                          <span className="block text-ink-muted">{kstStamp(r.updated_at)}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={href(f, r.shop_id)} aria-label={`${name} 관리`} className="flex min-h-11 items-center text-sm whitespace-nowrap text-brand underline">
                        관리
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <Manage
          key={selected.shop_id}
          row={selected}
          name={nameOf.get(selected.shop_id) ?? "(이름 없음)"}
          plan={selected.plan_code ? planByCode.get(selected.plan_code) ?? null : null}
          activePlans={activePlans}
          now={now}
          closeHref={href(f)}
          ownCap={(own?.data?.daily_cap as number | null | undefined) ?? null}
          history={historyRows.map((h) => ({ ...h, actor: h.actor_id ? personOf.get(h.actor_id) ?? "본사" : "시스템" }))}
        />
      )}

      <Plans plans={plans} />

      <ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-ink-muted">
        <li>응답 = 그 달 AI가 처리한 손님 메시지(성공 호출) 수입니다. 한도 = 사용권 포함량 + 그 달 팩.</li>
        <li>날짜는 한국 날짜입니다. 종료일은 쓸 수 있는 마지막 날이고, 그다음 날 0시에 끝납니다.</li>
        <li>체험 대기: 첫 자동응답이 나가면 그때부터 체험이 시작됩니다. 대기 끝까지 첫 자동응답이 없으면 그날부터 시작합니다.</li>
        <li>손님 메시지 내용·연락처는 이 화면에 나오지 않습니다(숫자 집계만).</li>
      </ul>
    </>
  );
}

type History = { id: string; action: string; actor: string; detail: Record<string, unknown>; created_at: string };

function Manage({
  row,
  name,
  plan,
  activePlans,
  now,
  closeHref,
  ownCap,
  history,
}: {
  row: OverviewRow;
  name: string;
  plan: Plan | null;
  activePlans: Plan[];
  now: number;
  closeHref: string;
  ownCap: number | null;
  history: History[];
}) {
  const v = licenseRow(row, now);
  const today = kstDateInput(new Date(now).toISOString());
  const months = packMonths(now);
  const nextMonthFirst = `${months[1]}-01`;
  const monthEnd = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  };
  const suspended = row.status === "suspended";
  const packInfo = plan ? `1팩 = ${cnt(plan.pack_size)}건 · ${won(plan.pack_price_krw)}(요금제 ${plan.code}).` : "";
  return (
    <section id="manage" aria-label={`${name} 사용권 관리`} className="flex min-w-0 flex-col gap-3 rounded-[14px] border-2 border-brand/30 bg-surface p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold break-all">{name}</h2>
        <Link href={closeHref} className="flex min-h-11 items-center text-sm text-ink-muted underline">
          닫기
        </Link>
      </div>
      <p className="text-sm">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE[v.label.tone]}`}>{v.label.text}</span>
        {row.status && (
          <span className="ml-2 text-ink-muted">
            {v.start} ~ {v.waitUntil ? `대기 끝 ${v.waitUntil}` : v.end}
            {row.included !== null && ` · 포함 ${cnt(row.included)}건 · 하루 상한 ${row.daily_cap === null ? "—" : cnt(row.daily_cap)}회`}
          </span>
        )}
      </p>
      {row.admin_note && (
        <p className="rounded-[10px] border border-line bg-white p-3 text-sm break-words">
          <span className="text-xs text-ink-muted">본사 메모 (샵에는 보이지 않음)</span>
          <br />
          {row.admin_note}
        </p>
      )}

      {!row.status ? (
        <div className="max-w-xl">
          <GrantForm shopId={row.shop_id} today={today} plans={activePlans.map((p) => ({ id: p.id, code: p.code, name: p.name, trial_days: p.trial_days }))} />
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <ExtendForm shopId={row.shop_id} suspended={suspended} endsOn={row.ends_at ? kstDateInput(new Date(Date.parse(row.ends_at) - 1).toISOString()) : today} />
          <PaidForm shopId={row.shop_id} startsOn={nextMonthFirst} endsOn={monthEnd(months[1])} />
          <PackForm shopId={row.shop_id} months={months} packInfo={packInfo} />
          <QuotaForm shopId={row.shop_id} included={Number(row.included ?? 1)} dailyCap={ownCap} defaultCap={ownCap === null ? row.daily_cap : null} />
          {!suspended && <SuspendForm shopId={row.shop_id} shopName={name} />}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-bold">이력</h3>
        {history.length === 0 ? (
          <p className="text-sm text-ink-muted">아직 이력이 없습니다.</p>
        ) : (
          <ol aria-label="사용권 이력" className="flex flex-col gap-1 rounded-[10px] border border-line bg-white p-3 text-sm">
            {history.map((h) => (
              <li key={h.id} className="border-b border-[#EEF1F6] py-1.5 break-words last:border-0">
                <span className="text-xs text-ink-muted">{kstStamp(h.created_at)}</span> <span className="font-medium">{historyLabel(h.action)}</span>{" "}
                <span className="text-xs text-ink-muted">· {h.actor}</span>
                {historyDetail(h.detail) && <span className="block text-xs text-ink-muted">{historyDetail(h.detail)}</span>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function Plans({ plans }: { plans: Plan[] }) {
  const active = plans.filter((p) => p.active);
  const old = plans.filter((p) => !p.active);
  const current = active[0] ?? null;
  const item = (p: Plan) => (
    <li key={p.id} className="flex flex-col gap-1 rounded-[10px] border border-line bg-white p-3 text-sm">
      <p className="font-bold">
        {p.name} <span className="text-xs font-normal text-ink-muted">{p.code}</span>
      </p>
      <p>
        월 {won(p.monthly_price_krw)}({p.vat_included ? "부가세 포함" : "부가세 별도"}) · 포함 {cnt(p.included_monthly_responses)}건 · 초과 시{" "}
        {p.overage_policy === "block" ? "자동응답 중지" : "허용"}
      </p>
      <p className="text-ink-muted">
        팩 {cnt(p.pack_size)}건 {won(p.pack_price_krw)} · 체험 {p.trial_days}일 · 대기 {p.trial_wait_days}일 · 만료 알림 {p.expiry_notice_days}일 전
      </p>
    </li>
  );
  return (
    <section aria-label="요금제" className="flex flex-col gap-2">
      <h2 className="text-base font-bold">요금제</h2>
      {active.length === 0 ? <p className="text-sm text-danger">새 부여에 쓸 요금제가 없습니다.</p> : <ul className="grid gap-2 md:grid-cols-2">{active.map(item)}</ul>}
      {old.length > 0 && (
        <details className="text-sm">
          <summary className="flex min-h-11 cursor-pointer items-center text-ink-muted">지난 요금제 {old.length}개</summary>
          <ul className="mt-2 grid gap-2 md:grid-cols-2">{old.map(item)}</ul>
        </details>
      )}
      <details className="text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center font-medium text-brand">새 요금제</summary>
        <div className="mt-2 max-w-3xl">
          <PlanForm current={current} />
        </div>
      </details>
    </section>
  );
}
