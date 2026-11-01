import { describe, expect, it } from "vitest";
import { dayWindowKst, lessonPhase, monthWindowKst, shiftDate, summarizeDay } from "./today";

const at = (s: string) => new Date(s).getTime();

describe("dayWindowKst", () => {
  it("한국 날짜 하루", () => {
    expect(dayWindowKst("2026-12-20")).toEqual({ from: "2026-12-20T00:00:00+09:00", to: "2026-12-21T00:00:00+09:00" });
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("한 달", () => {
    expect(monthWindowKst("2026-12-20")).toEqual({ from: "2026-12-01T00:00:00+09:00", to: "2027-01-01T00:00:00+09:00" });
  });
});

describe("lessonPhase", () => {
  const job = { starts_at: "2026-12-20T01:00:00Z", ends_at: "2026-12-20T03:00:00Z" }; // 10~12 KST
  it("상태와 시각으로 단계를 정한다", () => {
    expect(lessonPhase({ ...job, status: "canceled" }, at("2026-12-20T00:00:00Z"))).toBe("canceled");
    expect(lessonPhase({ ...job, status: "draft" }, at("2026-12-20T00:00:00Z"))).toBe("unassigned");
    expect(lessonPhase({ ...job, status: "open" }, at("2026-12-20T00:00:00Z"))).toBe("unassigned");
    expect(lessonPhase({ ...job, status: "assigned" }, at("2026-12-20T00:00:00Z"))).toBe("scheduled");
    expect(lessonPhase({ ...job, status: "assigned" }, at("2026-12-20T02:00:00Z"))).toBe("live");
    expect(lessonPhase({ ...job, status: "assigned" }, at("2026-12-20T04:00:00Z"))).toBe("report_due");
    expect(lessonPhase({ ...job, status: "done" }, at("2026-12-20T04:00:00Z"))).toBe("needs_approval");
    expect(lessonPhase({ ...job, status: "approved" }, at("2026-12-20T04:00:00Z"))).toBe("approved");
  });
});

describe("summarizeDay", () => {
  it("완료·진행·예정, 강사 수, 강습료 합계 (취소 제외)", () => {
    const now = at("2026-12-20T02:00:00Z"); // 11시
    const s = summarizeDay(
      [
        { status: "approved", starts_at: "2026-12-20T00:00:00Z", ends_at: "2026-12-20T01:00:00Z", price: 100000, instructorId: "a", isMine: true },
        { status: "assigned", starts_at: "2026-12-20T01:00:00Z", ends_at: "2026-12-20T03:00:00Z", price: 150000, instructorId: "b", isMine: false },
        { status: "assigned", starts_at: "2026-12-20T05:00:00Z", ends_at: "2026-12-20T07:00:00Z", price: 120000, instructorId: "a", isMine: true },
        { status: "canceled", starts_at: "2026-12-20T06:00:00Z", ends_at: "2026-12-20T08:00:00Z", price: 90000, instructorId: "c", isMine: false },
        { status: "draft", starts_at: "2026-12-20T08:00:00Z", ends_at: "2026-12-20T10:00:00Z", price: null, instructorId: null, isMine: false },
      ],
      now,
    );
    expect(s).toEqual({ total: 4, finished: 1, live: 1, upcoming: 2, instructors: 2, mine: 1, freelance: 1, revenue: 370000 });
  });
});
