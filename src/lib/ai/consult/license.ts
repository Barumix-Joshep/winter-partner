// AI 상담 사용권 표시 (P23-2, docs/ai-consult/paid-service-design.md 2-3·4·6-2절).
// 판정·건수는 DB(consult_my_usage → private.consult_license_ok·consult_month_used)가 하고, 여기서는 화면 문구와 날짜(한국 날짜)를 만든다.
// 숫자(포함량·팩·체험 일수)는 요금제 표에서 온 값을 그대로 쓴다(코드에 두지 않는다). 가격은 약관 확정 전이라 보이지 않는다(Q17).
import { kstMonthRange } from "./metrics";

const KST = 9 * 3600_000;
const DAY = 86_400_000;
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

// 응답 건수(Q1 결정): AI가 처리한 손님 메시지 = 그 한국 달 ai_usage feature 'consult', ok = true 행 수.
// 재시도의 실패 행은 빼고(성공은 메시지당 1행), 다른 AI 기능은 세지 않는다. DB private.consult_month_used와 같은 정의다.
export function countResponses(rows: { feature: string; ok: boolean; created_at: string }[], month: string): number {
  if (!MONTH.test(month)) return 0;
  const { from, to } = kstMonthRange(month);
  const f = Date.parse(from);
  const t = Date.parse(to);
  return rows.filter((r) => {
    const at = Date.parse(r.created_at);
    return r.feature === "consult" && r.ok && at >= f && at < t;
  }).length;
}

// 이번 달 한도 = 사용권 포함량 + 그 달 팩(Q6: 팩은 산 달만). DB private.consult_month_limit와 같은 정의
export function monthlyLimit(included: number, packs: { month: string; responses: number }[], month: string): number {
  return included + packs.filter((p) => p.month === month).reduce((n, p) => n + p.responses, 0);
}

const kstParts = (ms: number) => {
  const d = new Date(ms + KST);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), day: Math.floor((ms + KST) / DAY) };
};
const dateLabel = (ms: number) => {
  const p = kstParts(ms);
  return `${p.m}월 ${p.d}일`;
};

// 끝 시각(그다음 날 0시 KST, 포함하지 않음) → 마지막으로 쓸 수 있는 한국 날짜
export const lastDayLabel = (endsAt: string) => dateLabel(Date.parse(endsAt) - 1);
export const startDayLabel = (startsAt: string) => dateLabel(Date.parse(startsAt));

// 오늘을 포함해 남은 한국 날짜 수 (이미 끝났으면 0)
export function daysLeft(endsAt: string, now: number): number {
  const end = Date.parse(endsAt);
  if (end <= now) return 0;
  return kstParts(end - 1).day - kstParts(now).day + 1;
}

export function nextMonthFirstLabel(month: string): string {
  const m = Number(month.slice(5));
  return `${m === 12 ? 1 : m + 1}월 1일`;
}

// consult_my_usage(p_shop_id) 결과
export type LicenseUsage = {
  required: boolean; // 켜짐 스위치(consult_license_required)
  state: string; // ok / no_license / suspended / not_started / expired
  month: string;
  used: number;
  block: string | null; // 지금 AI를 막는 이유(no_license·monthly_quota), 스위치가 꺼져 있으면 null
  status?: "trial" | "paid" | "suspended";
  suspended_reason?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  wait_until?: string | null;
  included?: number;
  limit?: number | null;
  pack_size?: number;
  trial_days?: number;
};

const n = (v: unknown) => (v === null || v === undefined || v === "" ? undefined : Number(v));

export function parseUsage(raw: unknown): LicenseUsage | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.required !== "boolean" || typeof r.state !== "string" || typeof r.month !== "string") return null;
  return {
    required: r.required,
    state: r.state,
    month: r.month,
    used: n(r.used) ?? 0,
    block: typeof r.block === "string" ? r.block : null,
    status: r.status as LicenseUsage["status"],
    suspended_reason: (r.suspended_reason as string | null | undefined) ?? null,
    starts_at: (r.starts_at as string | null | undefined) ?? null,
    ends_at: (r.ends_at as string | null | undefined) ?? null,
    wait_until: (r.wait_until as string | null | undefined) ?? null,
    included: n(r.included),
    limit: n(r.limit) ?? null,
    pack_size: n(r.pack_size),
    trial_days: n(r.trial_days),
  };
}

export type LicenseView = {
  show: boolean; // 스위치가 켜져 있을 때만 화면에 보인다(꺼져 있으면 지금 화면 그대로)
  canTurnOn: boolean; // AI 자동 응대 켜기 버튼 (끄기는 언제나 된다)
  notice: string | null; // 설정 화면 안내
  period: string | null; // 체험·이용 기간
  usage: string | null; // 이번 달 사용량
  percent: number; // 이번 달 사용 비율(0~100, 막대)
  level: "ok" | "warn" | "full";
  banner: string | null; // 인박스 띠
};

const SUSPENDED_TEXT = "AI 상담 기간이 끝나 자동 답변을 멈췄어요. 손님 문의는 계속 인박스로 들어와요. 직접 답해 주세요. 다시 쓰시려면 본사에 요청해 주세요.";
const STOPPED_TEXT = "AI 상담 사용이 중지됐어요. 손님 문의는 계속 인박스로 들어와요. 직접 답해 주세요. 다시 쓰시려면 본사에 문의해 주세요.";

export function licenseView(u: LicenseUsage, now: number): LicenseView {
  const off: LicenseView = { show: false, canTurnOn: true, notice: null, period: null, usage: null, percent: 0, level: "ok", banner: null };
  if (!u.required) return off;

  const limit = u.limit ?? null;
  const level = limit ? (u.used >= limit ? "full" : u.used * 10 >= limit * 8 ? "warn" : "ok") : "ok";
  const percent = limit ? Math.min(100, Math.round((u.used / limit) * 100)) : 0;
  const usage = limit ? `이번 달 AI 응답 ${u.used.toLocaleString("ko-KR")} / ${limit.toLocaleString("ko-KR")}건 (${percent}%)` : null;
  const kind = u.status === "paid" ? "이용" : "무료 체험";
  const next = nextMonthFirstLabel(u.month);

  let period: string | null = null;
  if (u.state === "not_started" && u.starts_at) period = `${kind} 시작 전 — ${startDayLabel(u.starts_at)}부터`;
  else if (u.state === "ok" && u.status === "trial" && !u.starts_at) period = `무료 체험 대기 — 첫 자동 답변이 나간 때부터 ${u.trial_days ?? ""}일`;
  else if (u.state === "ok" && u.ends_at) {
    period = u.status === "trial" ? `무료 체험 중 — ${lastDayLabel(u.ends_at)}까지 (${daysLeft(u.ends_at, now)}일 남음)` : `이용 중 — ${lastDayLabel(u.ends_at)}까지`;
  }

  if (u.state === "ok") {
    const full = u.block === "monthly_quota";
    return {
      show: true,
      canTurnOn: true,
      notice: full ? `이번 달 포함 응답을 다 썼어요. ${next}까지 손님 문의는 사장님께 넘어가요. 추가 응답이 필요하면 본사에 요청해 주세요.` : null,
      period,
      usage,
      percent,
      level,
      banner: full ? `이번 달 포함 AI 응답을 모두 썼어요 — ${next}까지 모든 문의를 직접 답해 주세요.` : null,
    };
  }

  // 막힘: 켜기 버튼 대신 안내. 끄기·안내 정보 편집·인박스는 그대로 쓴다
  let notice: string;
  let banner: string;
  if (u.state === "no_license") {
    notice = `AI 상담은 별도 신청 서비스예요. 본사에 사용을 요청하시면 ${u.trial_days ? `${u.trial_days}일 ` : ""}무료 체험을 열어 드려요. 안내 정보는 지금 미리 채워 두실 수 있어요.`;
    banner = "AI 자동응답이 꺼져 있어요 — 모든 문의를 직접 답해 주세요. AI 상담을 쓰시려면 본사에 요청해 주세요.";
  } else if (u.state === "not_started") {
    const from = u.starts_at ? startDayLabel(u.starts_at) : "";
    notice = `${from}부터 AI 상담을 쓰실 수 있어요. 안내 정보는 지금 미리 채워 두실 수 있어요.`;
    banner = `AI 자동응답이 꺼져 있어요 — ${from}부터 쓰실 수 있어요. 그 전까지 모든 문의를 직접 답해 주세요.`;
  } else {
    const ended = u.state === "expired" || u.suspended_reason === "trial_ended" || u.suspended_reason === "expired";
    notice = ended ? SUSPENDED_TEXT : STOPPED_TEXT;
    banner = notice;
  }
  return { show: true, canTurnOn: false, notice, period, usage, percent, level, banner };
}
