import { describe, expect, it } from "vitest";
import { notificationMessage } from "./messages";

const job = { starts_at: "2026-12-20T01:00:00Z", ends_at: "2026-12-20T03:00:00Z", shop: "하이원 스노우렌탈" };

describe("notificationMessage", () => {
  it("직접 의뢰", () => {
    expect(notificationMessage("job_offer", { job_id: "j1" }, job)).toEqual({
      title: "새 직접 의뢰",
      body: "하이원 스노우렌탈 · 12/20(일) 10:00~12:00",
      url: "/instructor",
    });
  });

  it("선정 알림은 확정 금액을 보여 준다", () => {
    expect(notificationMessage("bid_selected", { job_id: "j1", amount: 175000 }, job).body).toBe(
      "하이원 스노우렌탈 · 12/20(일) 10:00~12:00 · 175,000원",
    );
  });

  it("팀 강습 승인: 팀원에게는 금액 없이, 팀 관리자에게 금액", () => {
    const m = notificationMessage("lesson_approved", { job_id: "j1", team: true }, job);
    expect(m.body).not.toMatch(/원$/);
    expect(m.body).toContain("팀 정산");
    expect(notificationMessage("lesson_approved", { job_id: "j1", amount: 95000 }, job).body).toContain("95,000원");
    expect(notificationMessage("team_lesson_approved", { job_id: "j1", amount: 185000 }, job)).toMatchObject({
      body: "하이원 스노우렌탈 · 12/20(일) 10:00~12:00 · 185,000원",
      url: "/shop/settlements",
    });
  });

  it("샵 알림은 강습 상세로 연결", () => {
    expect(notificationMessage("offer_accepted", { job_id: "j1" }, job).url).toBe("/shop/jobs/j1");
    expect(notificationMessage("instructor_canceled", { job_id: "j1" }, job).title).toBe("강사가 강습을 취소했습니다");
  });

  it("손님 취소는 강사에게 바로", () => {
    expect(notificationMessage("job_canceled", { job_id: "j1", by: "customer" }, job)).toMatchObject({ title: "손님 취소", url: "/instructor/schedule" });
  });

  it("지급 완료", () => {
    expect(notificationMessage("settlement_paid", { settlement_id: "s1", net: 193400 }, null)).toEqual({
      title: "정산금이 지급됐습니다",
      body: "실지급 193,400원",
      url: "/instructor/pay",
    });
  });

  it("모르는 종류도 깨지지 않는다", () => {
    expect(notificationMessage("something_new", {}, null)).toEqual({ title: "겨울파트너 알림", body: "", url: "/" });
  });
});
