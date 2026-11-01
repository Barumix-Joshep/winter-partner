// 오늘 일정 계산 (한국 날짜 기준)

export function shiftDate(date: string, days: number) {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86400_000).toISOString().slice(0, 10);
}

export function dayWindowKst(date: string) {
  return { from: `${date}T00:00:00+09:00`, to: `${shiftDate(date, 1)}T00:00:00+09:00` };
}

export function monthWindowKst(date: string) {
  const [y, m] = date.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { from: `${date.slice(0, 7)}-01T00:00:00+09:00`, to: `${next}-01T00:00:00+09:00` };
}

export type Phase = "canceled" | "unassigned" | "scheduled" | "live" | "report_due" | "needs_approval" | "approved";

export const PHASE_LABEL: Record<Phase, { label: string; cls: string }> = {
  canceled: { label: "취소", cls: "bg-[#FBE7E7] text-[#A32020]" },
  unassigned: { label: "미배정", cls: "bg-[#FFF1E0] text-[#B4560A]" },
  scheduled: { label: "예정", cls: "bg-surface text-[#35466A]" },
  live: { label: "진행 중", cls: "bg-[#E3EBFF] text-brand" },
  report_due: { label: "보고 대기", cls: "bg-[#FFF1E0] text-[#B4560A]" },
  needs_approval: { label: "승인 필요", cls: "bg-[#FFF1E0] text-[#B4560A]" },
  approved: { label: "완료", cls: "bg-[#E6F4EA] text-[#1B6B3A]" },
};

type J = { status: string; starts_at: string; ends_at: string };

export function lessonPhase(j: J, now: number): Phase {
  if (j.status === "canceled") return "canceled";
  if (j.status === "draft" || j.status === "open") return "unassigned";
  if (j.status === "approved") return "approved";
  if (j.status === "done") return "needs_approval";
  const s = new Date(j.starts_at).getTime();
  const e = new Date(j.ends_at).getTime();
  if (now < s) return "scheduled";
  return now < e ? "live" : "report_due";
}

export function summarizeDay(
  jobs: (J & { price: number | null; instructorId: string | null; isMine: boolean })[],
  now: number,
) {
  const active = jobs.filter((j) => j.status !== "canceled");
  const phases = active.map((j) => lessonPhase(j, now));
  const instructors = new Map<string, boolean>();
  for (const j of active) if (j.instructorId) instructors.set(j.instructorId, j.isMine);
  const mine = [...instructors.values()].filter(Boolean).length;
  return {
    total: active.length,
    finished: phases.filter((p) => p === "approved" || p === "needs_approval" || p === "report_due").length,
    live: phases.filter((p) => p === "live").length,
    upcoming: phases.filter((p) => p === "scheduled" || p === "unassigned").length,
    instructors: instructors.size,
    mine,
    freelance: instructors.size - mine,
    revenue: active.reduce((sum, j) => sum + (j.price ?? 0), 0),
  };
}
