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
    case "lesson_completed":
      return { title: "완료 보고가 들어왔습니다", body: `${when} · 승인해야 정산에 들어갑니다`, url: shopJob };
    case "lesson_approved":
      return { title: "강습이 승인됐습니다", body: withAmount(payload.amount), url: "/instructor/pay" };
    case "job_canceled":
      return { title: payload.by === "shop" ? "샵 사정으로 취소" : "손님 취소", body: `${when} · 정산에서 빠집니다`, url: "/instructor/schedule" };
    case "instructor_canceled":
      return { title: "강사가 강습을 취소했습니다", body: `${when} · 다시 배정해 주세요`, url: shopJob };
    case "settlement_paid":
      return { title: "정산금이 지급됐습니다", body: `실지급 ${won(payload.net)}`, url: "/instructor/pay" };
    default:
      return { title: "겨울파트너 알림", body: "", url: "/" };
  }
}
