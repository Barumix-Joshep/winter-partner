// 본사 AI 상담 사용권 화면 (P23-3, docs/ai-consult/paid-service-design.md 5절).
// 판정·집계는 DB(consult_admin_license_overview, 본사만)가 하고, 여기서는 표에 보일 글자·필터·버튼 입력 해석을 한다.
// 날짜는 한국 날짜. 종료 시각(ends_at)은 "마지막 날 다음 날 0시 KST"(포함하지 않음)이라 화면에는 마지막 날을 보인다.
// 가격·포함량 같은 숫자는 DB 값을 그대로 쓴다(코드에 두지 않는다).
import { daysLeft } from "./license";
import { parseMonth } from "./metrics";

const KST = 9 * 3600_000;
const DAY = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const NOTE_MAX = 500;

// consult_admin_license_overview 한 행 (numeric은 문자열로 올 수 있다)
export type OverviewRow = {
  shop_id: string;
  plan_code: string | null;
  status: "trial" | "paid" | "suspended" | null; // null = 사용권 없음
  state: string; // ok / no_license / suspended / not_started / expired (지금 시각 기준)
  suspended_reason: string | null;
  start_mode: string | null;
  starts_at: string | null; // 실제 시작(대기 14일이 지난 체험은 부여 + 14일)
  ends_at: string | null;
  wait_until: string | null; // 체험 대기 끝(부여 + 대기 일수)
  included: number | null;
  pack_responses: number;
  used: number;
  auto_replies: number;
  calls: number;
  fails: number;
  cost_krw: number | string;
  daily_max: number;
  daily_cap: number | null;
  kakao_on: boolean;
  instagram_on: boolean;
  auto_reply_on: boolean;
  updated_by: string | null;
  updated_at: string | null;
  admin_note: string | null;
};

export const SUSPEND_REASON_LABEL: Record<string, string> = {
  trial_ended: "체험 끝",
  expired: "기간 끝",
  admin: "본사",
  unpaid: "미납",
  terminated: "해지",
};
// 본사가 고를 수 있는 중지 이유 (DB consult_admin_suspend와 같다)
export const SUSPEND_REASONS = ["admin", "unpaid", "terminated"] as const;

export type Tone = "none" | "wait" | "trial" | "paid" | "stop";

const isWaiting = (r: OverviewRow) => r.status === "trial" && !r.starts_at;

export function statusLabel(r: OverviewRow): { text: string; tone: Tone } {
  if (!r.status) return { text: "사용권 없음", tone: "none" };
  if (r.status === "suspended") return { text: `중지 · ${SUSPEND_REASON_LABEL[r.suspended_reason ?? ""] ?? "이유 없음"}`, tone: "stop" };
  const kind = r.status === "paid" ? "유료" : "체험";
  const tone: Tone = r.status === "paid" ? "paid" : "trial";
  if (r.state === "expired") return { text: `${kind} · 기간 끝남`, tone: "stop" };
  if (r.state === "not_started") return { text: `${kind} · 시작 전`, tone };
  if (isWaiting(r)) return { text: "체험 대기", tone: "wait" };
  return { text: kind, tone };
}

// ISO 시각 → 한국 날짜 "YYYY-MM-DD" (날짜 입력칸 값과 같은 모양)
export function kstDateInput(iso: string): string {
  return new Date(Date.parse(iso) + KST).toISOString().slice(0, 10);
}
const lastDay = (iso: string) => kstDateInput(new Date(Date.parse(iso) - 1).toISOString());

// 한국 날짜 0시(시작) / 마지막 날 다음 날 0시(끝, 포함하지 않음) → UTC ISO
function kstDayStart(date: string): string {
  const [, y, m, d] = DATE.exec(date) ?? [];
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)) - KST).toISOString();
}
const kstDayAfter = (date: string) => new Date(Date.parse(kstDayStart(date)) + DAY).toISOString();
const validDate = (v: string) => DATE.test(v) && kstDateInput(kstDayStart(v)) === v; // 2월 30일 같은 날은 거른다

export function usageRatio(used: number, limit: number | null): { percent: number; level: "ok" | "warn" | "full" } {
  if (!limit) return { percent: 0, level: "ok" };
  const percent = Math.min(100, Math.round((used / limit) * 100));
  const level = used >= limit ? "full" : used * 10 >= limit * 8 ? "warn" : "ok";
  return { percent, level };
}

export function costPerResponse(cost: number | string, used: number): string {
  const c = Number(cost);
  if (!used || !Number.isFinite(c)) return "—";
  const v = c / used;
  return `${v >= 100 ? Math.round(v).toLocaleString("ko-KR") : String(Math.round(v * 10) / 10)}원`;
}

const active = (r: OverviewRow) => r.status === "trial" || r.status === "paid";

// 7일 안에 끝남: 아직 쓰는 사용권만(중지·이미 끝난 것은 빼고)
export function endingSoon(r: OverviewRow, now: number): boolean {
  if (!active(r) || !r.ends_at || r.state === "expired") return false;
  const d = daysLeft(r.ends_at, now);
  return d > 0 && d <= 7;
}

export function licenseRow(r: OverviewRow, now: number) {
  const limit = r.included === null || r.included === undefined ? null : Number(r.included) + Number(r.pack_responses ?? 0);
  return {
    label: statusLabel(r),
    start: r.starts_at ? kstDateInput(r.starts_at) : "—",
    end: r.ends_at ? lastDay(r.ends_at) : "—",
    waitUntil: isWaiting(r) && r.wait_until ? kstDateInput(r.wait_until) : null,
    daysLeft: active(r) && r.ends_at ? daysLeft(r.ends_at, now) : null,
    soon: endingSoon(r, now),
    limit,
    ratio: usageRatio(Number(r.used), limit),
    perResponse: costPerResponse(r.cost_krw, Number(r.used)),
  };
}

// 필터 ----------------------------------------------------------------------
export const STATUS_FILTERS = [
  ["all", "전체"],
  ["none", "사용권 없음"],
  ["waiting", "체험 대기"],
  ["trial", "체험"],
  ["paid", "유료"],
  ["suspended", "중지"],
] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number][0];
export type Filters = { status: StatusFilter; soon: boolean; over80: boolean; month: string };

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export function parseFilters(sp: Params, now: number): Filters {
  const s = one(sp.status);
  return {
    status: (STATUS_FILTERS.find(([k]) => k === s)?.[0] ?? "all") as StatusFilter,
    soon: one(sp.soon) === "1",
    over80: one(sp.over80) === "1",
    month: parseMonth(sp.month, now),
  };
}

function statusKey(r: OverviewRow): StatusFilter {
  if (!r.status) return "none";
  if (r.status === "suspended") return "suspended";
  if (isWaiting(r)) return "waiting";
  return r.status;
}

export function applyFilters(rows: OverviewRow[], f: Filters, now: number): OverviewRow[] {
  return rows.filter((r) => {
    if (f.status !== "all" && statusKey(r) !== f.status) return false;
    if (f.soon && !endingSoon(r, now)) return false;
    if (f.over80) {
      const lim = licenseRow(r, now).limit;
      if (!lim || Number(r.used) * 10 < lim * 8) return false;
    }
    return true;
  });
}

// 버튼 입력 해석 --------------------------------------------------------------
export type Parsed<T> = { ok: true; args: T } | { ok: false; message: string };
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const fail = (message: string) => ({ ok: false as const, message });

function shopOf(f: FormData): string | null {
  const v = str(f, "shop_id");
  return UUID.test(v) ? v : null;
}
function noteOf(f: FormData): string | null | false {
  const v = str(f, "note");
  if (v.length > NOTE_MAX) return false;
  return v || null;
}
// 정수만(쉼표 허용). 범위를 벗어나거나 소수면 null
function intOf(f: FormData, k: string, min: number, max: number): number | null {
  const v = str(f, k).replace(/,/g, "");
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
}

const NO_SHOP = "샵을 다시 골라 주세요.";
const LONG_NOTE = `메모는 ${NOTE_MAX}자까지 적어 주세요.`;

export function parseGrant(f: FormData): Parsed<{ p_shop_id: string; p_mode: "first_auto_reply" | "fixed"; p_starts_at: string | null; p_plan_id: string | null; p_note: string | null }> {
  const shop = shopOf(f);
  if (!shop) return fail(NO_SHOP);
  const mode = str(f, "mode") || "first_auto_reply";
  if (mode !== "first_auto_reply" && mode !== "fixed") return fail("시작 기준을 골라 주세요.");
  const date = str(f, "starts_on");
  if (mode === "fixed" && !validDate(date)) return fail("시작일을 넣어 주세요.");
  const plan = str(f, "plan_id");
  if (plan && !UUID.test(plan)) return fail("요금제를 다시 골라 주세요.");
  const note = noteOf(f);
  if (note === false) return fail(LONG_NOTE);
  return { ok: true, args: { p_shop_id: shop, p_mode: mode, p_starts_at: mode === "fixed" ? kstDayStart(date) : null, p_plan_id: plan || null, p_note: note } };
}

export function parseSetPaid(f: FormData): Parsed<{ p_shop_id: string; p_starts_at: string; p_ends_at: string; p_note: string | null }> {
  const shop = shopOf(f);
  if (!shop) return fail(NO_SHOP);
  const s = str(f, "starts_on");
  const e = str(f, "ends_on");
  if (!validDate(s) || !validDate(e)) return fail("청구 기간(시작일·종료일)을 넣어 주세요.");
  if (e < s) return fail("종료일은 시작일과 같거나 뒤로 넣어 주세요.");
  const note = noteOf(f);
  if (note === false) return fail(LONG_NOTE);
  return { ok: true, args: { p_shop_id: shop, p_starts_at: kstDayStart(s), p_ends_at: kstDayAfter(e), p_note: note } };
}

export function parseExtend(f: FormData): Parsed<{ p_shop_id: string; p_ends_at: string; p_note: string | null }> {
  const shop = shopOf(f);
  if (!shop) return fail(NO_SHOP);
  const e = str(f, "ends_on");
  if (!validDate(e)) return fail("새 종료일(마지막 날)을 넣어 주세요.");
  const note = noteOf(f);
  if (note === false) return fail(LONG_NOTE);
  return { ok: true, args: { p_shop_id: shop, p_ends_at: kstDayAfter(e), p_note: note } };
}

export function parseSuspend(f: FormData): Parsed<{ p_shop_id: string; p_reason: (typeof SUSPEND_REASONS)[number]; p_note: string | null }> {
  const shop = shopOf(f);
  if (!shop) return fail(NO_SHOP);
  const reason = str(f, "reason") as (typeof SUSPEND_REASONS)[number];
  if (!SUSPEND_REASONS.includes(reason)) return fail("중지 이유를 골라 주세요(본사·미납·해지).");
  if (str(f, "confirm") !== "yes") return fail("중지 확인을 한 번 더 눌러 주세요.");
  const note = noteOf(f);
  if (note === false) return fail(LONG_NOTE);
  return { ok: true, args: { p_shop_id: shop, p_reason: reason, p_note: note } };
}

// 팩을 넣을 수 있는 달: 한국 기준 이번 달·다음 달 (DB consult_admin_add_pack과 같다)
export function packMonths(now: number): [string, string] {
  const d = new Date(now + KST);
  const y = d.getUTCFullYear();
  const m0 = d.getUTCMonth();
  const ym = (t: number) => `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
  return [ym(y * 12 + m0), ym(y * 12 + m0 + 1)];
}

export function parseAddPack(f: FormData, now: number): Parsed<{ p_shop_id: string; p_month: string; p_count: number }> {
  const shop = shopOf(f);
  if (!shop) return fail(NO_SHOP);
  const month = str(f, "month");
  if (!packMonths(now).includes(month)) return fail("팩은 이번 달·다음 달만 넣을 수 있습니다.");
  const count = intOf(f, "count", 1, 20);
  if (count === null) return fail("팩 수는 1~20개로 넣어 주세요.");
  return { ok: true, args: { p_shop_id: shop, p_month: month, p_count: count } };
}

export function parseSetQuota(f: FormData): Parsed<{ p_shop_id: string; p_included: number; p_daily_cap: number | null }> {
  const shop = shopOf(f);
  if (!shop) return fail(NO_SHOP);
  const included = intOf(f, "included", 1, 1_000_000);
  if (included === null) return fail("포함 응답은 1~1,000,000건으로 넣어 주세요.");
  let cap: number | null = null;
  if (str(f, "daily_cap")) {
    cap = intOf(f, "daily_cap", 1, 10_000);
    if (cap === null) return fail("하루 상한은 1~10,000회로 넣어 주세요(비우면 기본값).");
  }
  return { ok: true, args: { p_shop_id: shop, p_included: included, p_daily_cap: cap } };
}

export type PlanArgs = {
  p_code: string;
  p_name: string;
  p_monthly_price_krw: number;
  p_included: number;
  p_overage_policy: "block" | "allow";
  p_pack_size: number;
  p_pack_price_krw: number;
  p_trial_days: number;
  p_trial_wait_days: number;
  p_expiry_notice_days: number;
  p_retire_plan_id: string | null;
};

// 범위는 DB consult_plans의 check와 같다
export function parseCreatePlan(f: FormData): Parsed<PlanArgs> {
  const code = str(f, "code");
  if (!/^[a-z0-9_]{1,40}$/.test(code)) return fail("코드는 영문 소문자·숫자·밑줄로 40자까지 적어 주세요(예: standard_v2).");
  const name = str(f, "name");
  if (name.length < 1 || name.length > 60) return fail("이름은 1~60자로 적어 주세요.");
  const policy = str(f, "overage_policy");
  if (policy !== "block" && policy !== "allow") return fail("초과 정책을 골라 주세요.");
  const nums = {
    p_monthly_price_krw: intOf(f, "monthly_price_krw", 0, 100_000_000),
    p_included: intOf(f, "included", 1, 1_000_000),
    p_pack_size: intOf(f, "pack_size", 1, 1_000_000),
    p_pack_price_krw: intOf(f, "pack_price_krw", 0, 100_000_000),
    p_trial_days: intOf(f, "trial_days", 1, 90),
    p_trial_wait_days: intOf(f, "trial_wait_days", 1, 90),
    p_expiry_notice_days: intOf(f, "expiry_notice_days", 0, 30),
  };
  if (Object.values(nums).some((v) => v === null)) return fail("숫자 칸의 범위를 확인해 주세요(월 요금·팩 가격 0원 이상, 체험·대기 1~90일, 만료 알림 0~30일).");
  const retire = str(f, "retire_plan_id");
  if (retire && !UUID.test(retire)) return fail("끌 요금제를 다시 골라 주세요.");
  return { ok: true, args: { p_code: code, p_name: name, p_overage_policy: policy, ...(nums as Record<keyof typeof nums, number>), p_retire_plan_id: retire || null } };
}

// DB 오류 → 화면 문구. 본사 RPC는 한국어 문구로 올리므로 그대로 보인다.
export function rpcErrorMessage(e: { code?: string; message?: string } | null | undefined): string {
  const msg = e?.message ?? "";
  if (/[가-힣]/.test(msg)) return msg;
  if (e?.code === "23505" && msg.includes("consult_plans_code")) return "이미 있는 요금제 코드입니다.";
  if (e?.code === "23514" || e?.code === "22003") return "입력한 값의 범위를 확인해 주세요.";
  if (e?.code === "42501") return "플랫폼 관리자만 할 수 있습니다.";
  return "처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
}

// 이력 (audit_events의 consult_* 동작) ----------------------------------------
const HISTORY_LABEL: Record<string, string> = {
  consult_license_granted: "체험 부여",
  consult_trial_started: "체험 시작",
  consult_license_paid: "유료 전환",
  consult_license_extended: "연장",
  consult_license_resumed: "다시 켬",
  consult_license_suspended: "중지",
  consult_license_quota_changed: "포함량·하루 상한 변경",
  consult_pack_added: "팩 추가",
  consult_auto_reply_off: "자동응답 끔",
  consult_auto_reply_on: "자동응답 켬",
  consult_plan_created: "새 요금제",
};
export const historyLabel = (action: string) => HISTORY_LABEL[action] ?? action;

// 감사 기록 detail → 짧은 설명 (날짜는 한국 날짜, 끝 시각은 마지막 날로)
export function historyDetail(detail: Record<string, unknown> | null | undefined): string {
  const d = detail ?? {};
  const parts: string[] = [];
  const s = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : null);
  const n = (k: string) => (typeof d[k] === "number" ? (d[k] as number) : null);
  if (s("plan")) parts.push(`요금제 ${s("plan")}`);
  if (s("start_mode")) parts.push(s("start_mode") === "fixed" ? "날짜 지정" : "첫 자동응답부터");
  if (s("starts_at")) parts.push(`시작 ${kstDateInput(s("starts_at")!)}`);
  if (s("old_ends_at") && s("ends_at")) parts.push(`종료 ${lastDay(s("old_ends_at")!)} → ${lastDay(s("ends_at")!)}`);
  else if (s("ends_at")) parts.push(`종료 ${lastDay(s("ends_at")!)}`);
  if (s("reason")) parts.push(`이유 ${SUSPEND_REASON_LABEL[s("reason")!] ?? s("reason")}`);
  if (s("from_reason")) parts.push(`이전 이유 ${SUSPEND_REASON_LABEL[s("from_reason")!] ?? s("from_reason")}`);
  if (s("month") && n("packs") !== null) parts.push(`${s("month")} ${n("packs")}팩(${(n("responses") ?? 0).toLocaleString("ko-KR")}건)`);
  if (n("included") !== null && n("old_included") !== null) parts.push(`포함 ${n("old_included")!.toLocaleString("ko-KR")} → ${n("included")!.toLocaleString("ko-KR")}건`);
  else if (n("included") !== null) parts.push(`포함 ${n("included")!.toLocaleString("ko-KR")}건`);
  if ("daily_cap" in d && "old_daily_cap" in d) parts.push(`하루 상한 ${d.old_daily_cap ?? "기본"} → ${d.daily_cap ?? "기본"}`);
  if (s("by") === "wait_elapsed") parts.push("대기 기간 지남");
  if (s("by") === "license_suspended") parts.push("사용권 중지로");
  if (d.migration === true) parts.push("자동 이행");
  return parts.join(" · ");
}
