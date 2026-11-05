// AI 상담 본사 지표 (P22-7). 숫자 집계는 DB(consult_admin_metrics·consult_admin_shop_costs, 본사만)에서 하고,
// 여기서는 기간(한국 시간 달)을 정하고 화면에 보일 글자로 바꾼다. 분모가 0이면 NaN 대신 "—".

const KST = 9 * 3600_000;
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

const ym = (y: number, m0: number) => `${y}-${String(m0 + 1).padStart(2, "0")}`;

function kstNow(now: number) {
  const d = new Date(now + KST);
  return { y: d.getUTCFullYear(), m0: d.getUTCMonth() };
}

// "2026-11" → 한국 11월 1일 0시 ~ 12월 1일 0시 (UTC ISO, to는 포함하지 않음)
export function kstMonthRange(month: string) {
  const [, y, m] = MONTH.exec(month) ?? [];
  const year = Number(y);
  const m0 = Number(m) - 1;
  return {
    from: new Date(Date.UTC(year, m0, 1) - KST).toISOString(),
    to: new Date(Date.UTC(year, m0 + 1, 1) - KST).toISOString(),
  };
}

// 주소의 ?month= 값. 형식이 틀리거나 미래 달이면 한국 기준 이번 달.
export function parseMonth(v: string | string[] | undefined, now: number) {
  const { y, m0 } = kstNow(now);
  const current = ym(y, m0);
  if (typeof v !== "string" || !MONTH.test(v)) return current;
  return v > current ? current : v;
}

// 고를 수 있는 달: 이번 달부터 n개
export function recentMonths(now: number, n = 12) {
  const { y, m0 } = kstNow(now);
  return Array.from({ length: n }, (_, i) => {
    const t = y * 12 + m0 - i;
    return ym(Math.floor(t / 12), t % 12);
  });
}

export const monthLabel = (month: string) => `${Number(month.slice(0, 4))}년 ${Number(month.slice(5))}월`;

export function rate(n: number, d: number) {
  if (!d || !Number.isFinite(n) || !Number.isFinite(d)) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

export function duration(sec: number | null | undefined) {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return "—";
  const s = Math.round(sec);
  if (s < 60) return `${s}초`;
  if (s < 3600) return s % 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s / 60}분`;
  const m = Math.round(s / 60);
  return m % 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m / 60}시간`;
}

// 하루 최대 호출 수 ÷ 샵 하루 상한
export function capUse(maxDay: number, cap: number) {
  if (!cap) return `${maxDay}회`;
  return `${maxDay}/${cap}회 (${rate(maxDay, cap)})`;
}

// consult_admin_metrics 한 행 (numeric은 문자열로 올 수 있다)
export type MetricsRow = {
  customer_messages: number;
  auto_replied: number;
  conversations: number;
  escalated_conversations: number;
  replied_conversations: number;
  first_reply_avg_sec: number | null;
  first_reply_median_sec: number | null;
  feedback_wrong: number;
  feedback_edited: number;
};

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const int = (v: unknown) => num(v) ?? 0;

export function summarize(row: MetricsRow | null | undefined) {
  const r = row ?? ({} as Partial<MetricsRow>);
  const msgs = int(r.customer_messages);
  const auto = int(r.auto_replied);
  const convs = int(r.conversations);
  const esc = int(r.escalated_conversations);
  const replied = int(r.replied_conversations);
  return {
    autoRate: rate(auto, msgs),
    autoDetail: `손님 메시지 ${msgs}건 중 ${auto}건`,
    escalationRate: rate(esc, convs),
    escalationDetail: `대화 ${convs}개 중 ${esc}개`,
    firstReplyAvg: duration(num(r.first_reply_avg_sec)),
    firstReplyMedian: duration(num(r.first_reply_median_sec)),
    firstReplyDetail: `응답한 대화 ${replied}/${convs}개`,
    wrong: int(r.feedback_wrong),
    edited: int(r.feedback_edited),
  };
}
