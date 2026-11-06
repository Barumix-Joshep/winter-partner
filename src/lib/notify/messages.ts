// 알림 종류(notifications.kind) → 푸시 문구. DB 함수들이 쌓은 행을 보낼 때 쓴다.
import { formatLessonTime } from "@/lib/shop/job-status";
import { lastDayLabel, nextMonthFirstLabel } from "@/lib/ai/consult/license";

type Payload = Record<string, unknown>;
type JobInfo = { starts_at: string; ends_at: string; shop: string | null } | null;
export type Message = { title: string; body: string; url: string };

const won = (v: unknown) => (typeof v === "number" ? `${v.toLocaleString("ko-KR")}원` : "");
const count = (v: unknown) => (typeof v === "number" ? v.toLocaleString("ko-KR") : "");
const lastDay = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? lastDayLabel(v) : "종료일");
const shopName = (p: Payload) => (typeof p.shop_name === "string" ? p.shop_name : "");
const CONSULT_SETTINGS = "/shop/ai-consult/knowledge";
const ADMIN_CONSULT = "/admin/ai/consult"; // 본사 AI 상담 사용권 화면 (P23-3)
const SUSPEND_REASON: Record<string, string> = { trial_ended: "체험 끝", expired: "기간 끝", admin: "본사 중지", unpaid: "미납", terminated: "해지" };

export function notificationMessage(kind: string, payload: Payload, job: JobInfo): Message {
  const jobId = typeof payload.job_id === "string" ? payload.job_id : "";
  const when = job ? [job.shop, formatLessonTime(job.starts_at, job.ends_at)].filter(Boolean).join(" · ") : "";
  const withAmount = (amount: unknown) => [when, won(amount)].filter(Boolean).join(" · ");
  const shopJob = `/shop/jobs/${jobId}`;

  switch (kind) {
    case "job_offer":
      return { title: "새 직접 의뢰", body: when, url: "/instructor" };
    case "offer_accepted":
      return { title: "의뢰를 수락했습니다", body: when, url: shopJob };
    case "offer_declined":
      return { title: "의뢰를 거절했습니다", body: `${when} · 다른 강사에게 의뢰하거나 공고로 내 주세요`, url: shopJob };
    case "bid_placed":
      return { title: "새 입찰", body: when, url: shopJob };
    case "bid_selected":
      return { title: "입찰에 선정됐습니다", body: withAmount(payload.amount), url: "/instructor" };
    case "bid_rejected":
      return { title: "다른 강사가 선정됐습니다", body: when, url: "/instructor/bids" };
    case "team_assigned":
      return { title: "팀 강습을 맡게 됐습니다", body: when, url: "/instructor/schedule" };
    case "lesson_completed":
      return { title: "완료 보고가 들어왔습니다", body: `${when} · 승인해야 정산에 들어갑니다`, url: shopJob };
    case "lesson_approved":
      // 팀 강습은 금액 없이 (팀 몫은 팀이 정한다)
      return payload.team
        ? { title: "강습이 승인됐습니다", body: `${when} · 팀 정산으로 처리됩니다`, url: "/instructor/schedule" }
        : { title: "강습이 승인됐습니다", body: withAmount(payload.amount), url: "/instructor/pay" };
    case "team_lesson_approved":
      return { title: "팀 강습이 승인됐습니다", body: withAmount(payload.amount), url: "/shop/settlements" };
    case "job_canceled":
      return { title: payload.by === "shop" ? "샵 사정으로 취소" : "손님 취소", body: `${when} · 정산에서 빠집니다`, url: "/instructor/schedule" };
    case "instructor_canceled":
      return { title: "강사가 강습을 취소했습니다", body: `${when} · 다시 배정해 주세요`, url: shopJob };
    case "settlement_paid":
      return { title: "정산금이 지급됐습니다", body: `실지급 ${won(payload.net)}`, url: "/instructor/pay" };
    case "ai_cap_reached":
      return { title: "AI 월 비용 상한에 닿았습니다", body: "이번 달 남은 기간은 AI 도우미가 꺼지고 수동으로 동작합니다", url: "/admin/ai" };
    // AI 상담 사용권 (P23-2, 문구는 설계 6-2 초안). DB(consult_license_sweep·ai_gate·본사 RPC)가 쌓는다. payload.admin이면 본사에게 간 알림
    case "consult_license_granted":
      return {
        title: "AI 상담 무료 체험이 열렸어요",
        body: `AI 자동 응대를 켜고 첫 자동 답변이 나간 때부터 ${count(payload.trial_days)}일 동안 무료로 쓰실 수 있어요. 체험이 끝나도 자동으로 요금이 청구되지 않아요.`,
        url: CONSULT_SETTINGS,
      };
    case "consult_license_expiring":
      return {
        title: `AI 상담 ${payload.status === "paid" ? "이용" : "체험"} 기간이 곧 끝나요`,
        body: `${lastDay(payload.ends_at)}까지 쓰실 수 있어요. 계속 쓰시려면 본사에 연장을 요청해 주세요. 끝나면 AI 자동 답변이 멈추고 모든 문의가 사장님께 넘어가요.`,
        url: CONSULT_SETTINGS,
      };
    case "consult_license_suspended":
      return payload.admin
        ? { title: "AI 상담 사용권이 중지됐습니다", body: [shopName(payload), SUSPEND_REASON[String(payload.reason)] ?? ""].filter(Boolean).join(" · "), url: ADMIN_CONSULT }
        : {
            title: "AI 상담 자동 답변을 멈췄어요",
            body: "손님 문의는 계속 인박스로 들어와요. 직접 답해 주세요. 다시 쓰시려면 본사에 요청해 주세요.",
            url: "/shop/ai-consult/inbox",
          };
    case "consult_license_extended":
      return { title: "AI 상담이 연장됐어요", body: `${lastDay(payload.ends_at)}까지 쓰실 수 있어요. 설정 화면에서 AI 자동 응대를 다시 켜 주세요.`, url: CONSULT_SETTINGS };
    case "consult_quota_warning":
    case "consult_quota_reached": {
      const usedOf = `${count(payload.used)}/${count(payload.limit)}건`;
      const full = kind === "consult_quota_reached";
      if (payload.admin) return { title: full ? "AI 상담 월 포함 응답 소진" : "AI 상담 월 포함 응답 80%", body: [shopName(payload), usedOf].filter(Boolean).join(" · "), url: ADMIN_CONSULT };
      return full
        ? {
            title: "이번 달 포함 AI 응답을 모두 썼어요",
            body: `${typeof payload.month === "string" ? nextMonthFirstLabel(payload.month) : "다음 달 1일"}까지 손님 문의는 사장님께 넘어가요. 추가 응답이 필요하면 본사에 요청해 주세요.`,
            url: CONSULT_SETTINGS,
          }
        : {
            title: "이번 달 AI 응답 80%를 썼어요",
            body: `이번 달 AI 응답을 ${usedOf} 썼어요. 다 쓰면 그달 말까지 자동 답변이 멈추고 사장님께 넘어가요. 추가 응답이 필요하면 본사에 요청해 주세요.`,
            url: CONSULT_SETTINGS,
          };
    }
    case "ops_errors":
      return { title: "서버 오류가 늘었습니다", body: `최근 한 시간 ${payload.count ?? ""}건 · 운영 상태를 확인해 주세요`, url: "/admin/ops" };
    case "ai_fail_rate":
      return { title: "AI 호출 실패가 많습니다", body: `최근 한 시간 ${payload.calls ?? ""}회 중 ${payload.fails ?? ""}회 실패 · 화면은 수동으로 동작합니다`, url: "/admin/ops" };
    case "shop_change_requested":
      return { title: "샵 정보 변경 요청", body: "유형·사업자번호 변경을 확인해 주세요", url: "/admin" };
    case "shop_change_decided":
      return payload.approved
        ? { title: "샵 정보 변경이 승인됐습니다", body: "새 사업자번호·유형이 정산서에 반영됩니다", url: "/shop/settings" }
        : { title: "샵 정보 변경이 반려됐습니다", body: "본사에 문의해 주세요", url: "/shop/settings" };
    default:
      return { title: "겨울파트너 알림", body: "", url: "/" };
  }
}
