import { describe, expect, it } from "vitest";
import { noticeMessage, withNotice } from "./notice";

describe("noticeMessage", () => {
  it("완료 보고·수락·취소 안내", () => {
    expect(noticeMessage("reported")).toBe("완료 보고했습니다. 샵이 승인하면 정산에 들어갑니다.");
    expect(noticeMessage("reported-health")).toContain("건강 정보");
    expect(noticeMessage("accepted")).toBe("의뢰를 수락했습니다. 일정에서 확인할 수 있습니다.");
    expect(noticeMessage("canceled-1")).toBe("취소했습니다. 패널티 1점이 기록됐습니다.");
    expect(noticeMessage("canceled-3")).toBe("취소했습니다. 패널티 3점이 기록됐습니다.");
  });
  it("모르는 값은 무시한다 (주소에 아무 문구나 넣어 띄울 수 없게)", () => {
    expect(noticeMessage("canceled-<b>")).toBeNull();
    expect(noticeMessage("hello")).toBeNull();
    expect(noticeMessage(null)).toBeNull();
  });
});

describe("withNotice", () => {
  it("돌아갈 경로에 notice를 붙인다", () => {
    expect(withNotice("/instructor", "reported")).toBe("/instructor?notice=reported");
    expect(withNotice("/instructor/schedule?week=2026-11-22", "canceled-1")).toBe("/instructor/schedule?week=2026-11-22&notice=canceled-1");
    expect(withNotice("/instructor?notice=accepted", "reported")).toBe("/instructor?notice=reported");
  });
  it("강사 화면 밖으로는 보내지 않는다", () => {
    expect(withNotice("https://evil.example/instructor", "reported")).toBe("/instructor?notice=reported");
    expect(withNotice("//evil.example", "reported")).toBe("/instructor?notice=reported");
    expect(withNotice("/shop", "reported")).toBe("/instructor?notice=reported");
  });
});
