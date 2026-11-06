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

  it("운영 알림은 본사 운영 상태 화면으로", () => {
    expect(notificationMessage("ops_errors", { count: 5 }, null)).toEqual({
      title: "서버 오류가 늘었습니다",
      body: "최근 한 시간 5건 · 운영 상태를 확인해 주세요",
      url: "/admin/ops",
    });
    expect(notificationMessage("ai_fail_rate", { calls: 10, fails: 3 }, null).body).toContain("10회 중 3회 실패");
  });

  describe("AI 상담 사용권 (P23-2, 문구는 설계 6-2 초안)", () => {
    const KNOW = "/shop/ai-consult/knowledge";
    it("만료 3일 전: 종료일(한국 날짜)과 연장 안내, 샵 설정 화면으로", () => {
      const m = notificationMessage("consult_license_expiring", { status: "trial", ends_at: "2026-11-19T15:00:00Z" }, null);
      expect(m.title).toBe("AI 상담 체험 기간이 곧 끝나요");
      expect(m.body).toContain("11월 19일까지");
      expect(m.body).toContain("본사에 연장을 요청");
      expect(m.url).toBe(KNOW);
      expect(notificationMessage("consult_license_expiring", { status: "paid", ends_at: "2026-12-31T15:00:00Z" }, null).title).toBe("AI 상담 이용 기간이 곧 끝나요");
    });
    it("중지됨: 샵은 인박스로, 본사는 샵 이름과 함께 본사 사용권 화면으로", () => {
      expect(notificationMessage("consult_license_suspended", { reason: "trial_ended" }, null)).toMatchObject({
        title: "AI 상담 자동 답변을 멈췄어요",
        url: "/shop/ai-consult/inbox",
      });
      expect(notificationMessage("consult_license_suspended", { reason: "expired", admin: true, shop_name: "[테스트] 하이원" }, null)).toEqual({
        title: "AI 상담 사용권이 중지됐습니다",
        body: "[테스트] 하이원 · 기간 끝",
        url: "/admin/ai/consult",
      });
    });
    it("80%·100%: 사용 건수/한도", () => {
      const warn = notificationMessage("consult_quota_warning", { used: 1600, limit: 2000, month: "2026-11" }, null);
      expect(warn.title).toBe("이번 달 AI 응답 80%를 썼어요");
      expect(warn.body).toContain("1,600/2,000건");
      expect(warn.url).toBe(KNOW);
      const full = notificationMessage("consult_quota_reached", { used: 2000, limit: 2000, month: "2026-11" }, null);
      expect(full.title).toBe("이번 달 포함 AI 응답을 모두 썼어요");
      expect(full.body).toContain("12월 1일까지");
      expect(notificationMessage("consult_quota_reached", { used: 2000, limit: 2000, month: "2026-12", admin: true, shop_name: "A샵" }, null)).toMatchObject({
        body: "A샵 · 2,000/2,000건",
        url: "/admin/ai/consult",
      });
    });
    it("부여·연장", () => {
      expect(notificationMessage("consult_license_granted", { trial_days: 10 }, null)).toMatchObject({ title: "AI 상담 무료 체험이 열렸어요", url: KNOW });
      expect(notificationMessage("consult_license_granted", { trial_days: 10 }, null).body).toContain("10일");
      expect(notificationMessage("consult_license_extended", { ends_at: "2026-12-31T15:00:00Z" }, null).body).toContain("12월 31일까지");
    });
  });
});
