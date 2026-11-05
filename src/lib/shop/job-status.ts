// 강습 상태 표시 (샵 화면)
type Job = { status: string; assign_mode: string };

export function jobStatusLabel(j: Job): { label: string; cls: string } {
  switch (j.status) {
    case "draft":
      return { label: "임시 저장", cls: "bg-[#EEF1F6] text-ink-muted" };
    case "open":
      return j.assign_mode === "bid"
        ? { label: "입찰 중", cls: "bg-[#FFF1E0] text-[#B4560A]" }
        : { label: "의뢰 응답 대기", cls: "bg-[#FFF1E0] text-[#B4560A]" };
    case "assigned":
      return { label: "확정", cls: "bg-[#E3EBFF] text-brand" };
    case "done":
      return { label: "완료 보고", cls: "bg-[#E3EBFF] text-brand" };
    case "approved":
      return { label: "승인", cls: "bg-[#E6F4EA] text-[#1E7B34]" };
    default:
      return { label: "취소", cls: "bg-red-50 text-danger" };
  }
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

// 한국 시간 "12/20(일) 10:00~12:00"
export function formatLessonTime(startsAt: string, endsAt: string) {
  const fmt = (iso: string) => {
    const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
    return {
      md: `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAY[d.getUTCDay()]})`,
      hm: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
    };
  };
  const s = fmt(startsAt);
  const e = fmt(endsAt);
  return `${s.md} ${s.hm}~${e.md === s.md ? "" : "다음 날 "}${e.hm}`; // 자정을 넘는 강습 (P19-3)
}

// 목록에 보일 강습: 지난 7일 이후에 끝나는 것
export function recentJobsCutoff(now = new Date()) {
  return new Date(now.getTime() - 7 * 86400_000).toISOString();
}

// 폼 기본값용 한국 시간 날짜·시각 ("2026-12-20", "10:00")
export function kstHm(iso: string) {
  const s = new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString();
  return { date: s.slice(0, 10), time: s.slice(11, 16) };
}
