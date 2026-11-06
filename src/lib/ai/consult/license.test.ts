// P23-2 AI 상담 사용권 표시·집계: 응답 건수(Q1: 그 한국 달 consult 성공 호출), 한도(포함량 + 그 달 팩), 날짜(한국 날짜), 화면 문구.
import { describe, expect, it } from "vitest";
import { countResponses, daysLeft, lastDayLabel, licenseView, monthlyLimit, nextMonthFirstLabel, parseUsage } from "./license";

const NOW = Date.parse("2026-11-15T03:00:00Z"); // 11/15 12:00 KST

describe("응답 건수 (Q1 결정: AI가 처리한 손님 메시지 = 그 한국 달 consult 성공 호출 수)", () => {
  const rows = [
    { feature: "consult", ok: true, created_at: "2026-11-01T00:30:00+09:00" }, // 11월 첫 시각(KST) — 셈
    { feature: "consult", ok: true, created_at: "2026-10-31T15:00:00Z" }, // = 11/1 0시 KST — 셈
    { feature: "consult", ok: true, created_at: "2026-10-31T14:59:59Z" }, // 10/31 23:59 KST — 지난달
    { feature: "consult", ok: false, created_at: "2026-11-10T00:00:00Z" }, // 재시도 실패 — 빼고
    { feature: "consult", ok: true, created_at: "2026-11-10T00:00:01Z" }, // 같은 메시지의 성공 — 셈
    { feature: "intake", ok: true, created_at: "2026-11-10T00:00:00Z" }, // 다른 AI 기능 — 빼고
    { feature: "consult", ok: true, created_at: "2026-11-30T14:59:59Z" }, // 11/30 23:59 KST — 셈
    { feature: "consult", ok: true, created_at: "2026-11-30T15:00:00Z" }, // 12/1 0시 KST — 다음 달
  ];
  it("성공 호출만, 한국 달 경계로", () => {
    expect(countResponses(rows, "2026-11")).toBe(4);
    expect(countResponses(rows, "2026-10")).toBe(1);
    expect(countResponses(rows, "2026-12")).toBe(1);
  });
  it("잘못된 달은 0", () => {
    expect(countResponses(rows, "2026-13")).toBe(0);
  });
});

describe("이번 달 한도 = 포함량 + 그 달 팩 (Q6: 팩은 산 달만)", () => {
  it("다른 달 팩은 더하지 않는다", () => {
    const packs = [
      { month: "2026-11", responses: 1000 },
      { month: "2026-11", responses: 2000 },
      { month: "2026-12", responses: 1000 },
    ];
    expect(monthlyLimit(2000, packs, "2026-11")).toBe(5000);
    expect(monthlyLimit(2000, packs, "2026-10")).toBe(2000);
  });
});

describe("날짜 (한국 날짜)", () => {
  it("끝 시각(다음 날 0시 KST)은 그 전날까지로 보여 준다", () => {
    expect(lastDayLabel("2026-11-19T15:00:00Z")).toBe("11월 19일"); // 11/20 0시 KST 끝
    expect(lastDayLabel("2026-12-31T15:00:00Z")).toBe("12월 31일");
  });
  it("남은 일수는 오늘을 포함한 한국 날짜 수", () => {
    expect(daysLeft("2026-11-19T15:00:00Z", NOW)).toBe(5); // 15·16·17·18·19
    expect(daysLeft("2026-11-15T15:00:00Z", NOW)).toBe(1); // 오늘이 마지막 날
    expect(daysLeft("2026-11-15T02:00:00Z", NOW)).toBe(0); // 이미 끝남
  });
  it("다음 달 1일", () => {
    expect(nextMonthFirstLabel("2026-11")).toBe("12월 1일");
    expect(nextMonthFirstLabel("2026-12")).toBe("1월 1일");
  });
});

describe("consult_my_usage 응답 읽기", () => {
  it("형식이 틀리거나 없으면 null(화면은 지금처럼)", () => {
    expect(parseUsage(null)).toBeNull();
    expect(parseUsage({ hello: 1 })).toBeNull();
  });
  it("숫자 문자열도 숫자로", () => {
    expect(parseUsage({ required: true, state: "ok", month: "2026-11", used: "12", limit: "2000", included: 2000 })).toMatchObject({ used: 12, limit: 2000 });
  });
});

describe("화면 표시 licenseView", () => {
  const base = { required: true, month: "2026-11", used: 0, block: null };
  it("스위치가 꺼져 있으면 아무것도 바꾸지 않는다(지금 동작)", () => {
    const v = licenseView({ ...base, required: false, state: "no_license" }, NOW);
    expect(v).toMatchObject({ show: false, canTurnOn: true, banner: null });
  });
  it("사용권 없음: 켜기 막힘 + 신청 안내 + 인박스 띠", () => {
    const v = licenseView({ ...base, state: "no_license" }, NOW);
    expect(v.show).toBe(true);
    expect(v.canTurnOn).toBe(false);
    expect(v.notice).toContain("AI 상담은 별도 신청 서비스예요");
    expect(v.banner).toBe("AI 자동응답이 꺼져 있어요 — 모든 문의를 직접 답해 주세요. AI 상담을 쓰시려면 본사에 요청해 주세요.");
  });
  it("중지(체험 끝): 켜기 막힘, 띠는 기간 끝 문구", () => {
    const v = licenseView({ ...base, state: "suspended", status: "suspended", suspended_reason: "trial_ended", included: 2000, limit: 2000 }, NOW);
    expect(v.canTurnOn).toBe(false);
    expect(v.banner).toContain("AI 상담 기간이 끝나 자동 답변을 멈췄어요");
  });
  it("체험 대기: 첫 자동 답변부터 10일", () => {
    const v = licenseView({ ...base, state: "ok", status: "trial", trial_days: 10, wait_until: "2026-11-29T01:00:00Z", included: 2000, limit: 2000 }, NOW);
    expect(v.canTurnOn).toBe(true);
    expect(v.period).toBe("무료 체험 대기 — 첫 자동 답변이 나간 때부터 10일");
    expect(v.banner).toBeNull();
  });
  it("체험 중: 종료일·남은 일수, 이번 달 사용량", () => {
    const v = licenseView({ ...base, state: "ok", status: "trial", starts_at: "2026-11-10T05:00:00Z", ends_at: "2026-11-19T15:00:00Z", used: 1240, included: 2000, limit: 2000 }, NOW);
    expect(v.period).toBe("무료 체험 중 — 11월 19일까지 (5일 남음)");
    expect(v.usage).toBe("이번 달 AI 응답 1,240 / 2,000건 (62%)");
    expect(v.level).toBe("ok");
  });
  it("80%면 경고, 100%(block)면 켜기는 되지만 소진 안내와 띠", () => {
    expect(licenseView({ ...base, state: "ok", status: "paid", ends_at: "2026-12-31T15:00:00Z", used: 1600, included: 2000, limit: 2000 }, NOW).level).toBe("warn");
    const full = licenseView({ ...base, state: "ok", status: "paid", ends_at: "2026-12-31T15:00:00Z", used: 2000, included: 2000, limit: 2000, block: "monthly_quota" }, NOW);
    expect(full.level).toBe("full");
    expect(full.canTurnOn).toBe(true);
    expect(full.period).toBe("이용 중 — 12월 31일까지");
    expect(full.notice).toBe("이번 달 포함 응답을 다 썼어요. 12월 1일까지 손님 문의는 사장님께 넘어가요. 추가 응답이 필요하면 본사에 요청해 주세요.");
    expect(full.banner).toBe("이번 달 포함 AI 응답을 모두 썼어요 — 12월 1일까지 모든 문의를 직접 답해 주세요.");
  });
  it("시작 전(지정일): 켜기 막힘", () => {
    const v = licenseView({ ...base, state: "not_started", status: "trial", starts_at: "2026-11-20T00:00:00Z", ends_at: "2026-11-29T15:00:00Z", included: 2000, limit: 2000 }, NOW);
    expect(v.canTurnOn).toBe(false);
    expect(v.period).toBe("무료 체험 시작 전 — 11월 20일부터");
  });
});
