import { describe, expect, it } from "vitest";
import { formatLessonTime, jobStatusLabel } from "./job-status";

describe("formatLessonTime", () => {
  it("한국 시간으로 보여 준다 (서버가 UTC여도)", () => {
    expect(formatLessonTime("2026-12-20T01:00:00Z", "2026-12-20T03:00:00Z")).toBe("12/20(일) 10:00~12:00");
    expect(formatLessonTime("2026-12-31T13:00:00Z", "2026-12-31T16:00:00Z")).toBe("12/31(목) 22:00~다음 날 01:00");
    expect(formatLessonTime("2026-12-19T23:30:00Z", "2026-12-20T01:30:00Z")).toBe("12/20(일) 08:30~10:30");
  });
});

describe("jobStatusLabel", () => {
  it("직접 의뢰와 입찰을 구분한다", () => {
    expect(jobStatusLabel({ status: "open", assign_mode: "direct" }).label).toBe("의뢰 응답 대기");
    expect(jobStatusLabel({ status: "open", assign_mode: "bid" }).label).toBe("입찰 중");
  });
});
