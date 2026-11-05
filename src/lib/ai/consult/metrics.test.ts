import { describe, expect, it } from "vitest";
import { capUse, duration, kstMonthRange, parseMonth, rate, recentMonths, summarize } from "./metrics";

// 2026-11-30 15:30 UTC = 한국 12월 1일 0시 30분
const DEC1_KST = Date.UTC(2026, 10, 30, 15, 30);

describe("한국 시간 달 경계", () => {
  it("달의 시작·끝을 한국 0시로", () => {
    expect(kstMonthRange("2026-11")).toEqual({ from: "2026-10-31T15:00:00.000Z", to: "2026-11-30T15:00:00.000Z" });
  });
  it("12월 → 다음 해 1월", () => {
    expect(kstMonthRange("2026-12").to).toBe("2026-12-31T15:00:00.000Z");
  });
  it("기본값은 한국 기준 이번 달 (UTC로는 아직 11월이어도)", () => {
    expect(parseMonth(undefined, DEC1_KST)).toBe("2026-12");
  });
  it("이상한 값·미래 달은 이번 달로", () => {
    expect(parseMonth("2026-13", DEC1_KST)).toBe("2026-12");
    expect(parseMonth("abc", DEC1_KST)).toBe("2026-12");
    expect(parseMonth("2027-01", DEC1_KST)).toBe("2026-12");
    expect(parseMonth(["2026-10"], DEC1_KST)).toBe("2026-12");
    expect(parseMonth("2026-10", DEC1_KST)).toBe("2026-10");
  });
  it("최근 달 목록은 이번 달부터 거꾸로, 해를 넘어간다", () => {
    expect(recentMonths(DEC1_KST, 13)).toHaveLength(13);
    expect(recentMonths(DEC1_KST, 13)[0]).toBe("2026-12");
    expect(recentMonths(DEC1_KST, 13)[12]).toBe("2025-12");
  });
});

describe("비율·시간 표시", () => {
  it("분모가 0이면 —", () => {
    expect(rate(0, 0)).toBe("—");
    expect(rate(3, 0)).toBe("—");
  });
  it("반올림한 백분율", () => {
    expect(rate(2, 3)).toBe("67%");
    expect(rate(3, 3)).toBe("100%");
    expect(rate(0, 4)).toBe("0%");
  });
  it("응답 시간", () => {
    expect(duration(null)).toBe("—");
    expect(duration(Number.NaN)).toBe("—");
    expect(duration(45.4)).toBe("45초");
    expect(duration(200)).toBe("3분 20초");
    expect(duration(7500)).toBe("2시간 5분");
  });
  it("하루 상한 사용률", () => {
    expect(capUse(150, 300)).toBe("150/300회 (50%)");
    expect(capUse(0, 0)).toBe("0회");
  });
});

describe("카드 요약", () => {
  it("빈 기간은 모두 — (NaN 없음)", () => {
    const s = summarize(null);
    expect(s.autoRate).toBe("—");
    expect(s.escalationRate).toBe("—");
    expect(s.firstReplyAvg).toBe("—");
    expect(s.firstReplyMedian).toBe("—");
    expect(s.wrong).toBe(0);
    expect(JSON.stringify(s)).not.toContain("NaN");
  });
  it("숫자 문자열(numeric)도 받는다", () => {
    const s = summarize({
      customer_messages: 4,
      auto_replied: 3,
      conversations: 2,
      escalated_conversations: 1,
      replied_conversations: 2,
      first_reply_avg_sec: "90.000" as unknown as number,
      first_reply_median_sec: "60" as unknown as number,
      feedback_wrong: 1,
      feedback_edited: 2,
    });
    expect(s).toMatchObject({ autoRate: "75%", escalationRate: "50%", firstReplyAvg: "1분 30초", firstReplyMedian: "1분", wrong: 1, edited: 2 });
    expect(s.autoDetail).toBe("손님 메시지 4건 중 3건");
    expect(s.escalationDetail).toBe("대화 2개 중 1개");
    expect(s.firstReplyDetail).toBe("응답한 대화 2/2개");
  });
});
