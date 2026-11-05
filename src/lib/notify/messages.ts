// 알림 종류(notifications.kind) → 푸시 문구. DB 함수들이 쌓은 행을 보낼 때 쓴다.
import { formatLessonTime } from "@/lib/shop/job-status";

type Payload = Record<string, unknown>;
type JobInfo = { starts_at: string; ends_at: string; shop: string | null } | null;
export type Message = { title: string; body: string; url: string };

const won = (v: unknown) => (typeof v === "number" ? `${v.toLocaleString("ko-KR")}원` : "");

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
