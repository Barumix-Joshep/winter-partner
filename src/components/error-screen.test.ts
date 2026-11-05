import { describe, expect, it } from "vitest";
import { errorCode } from "./error-screen";

describe("오류 번호 (P19-3)", () => {
  it("서버 오류의 digest만 보여 주고, 메시지(개인정보가 섞일 수 있음)는 쓰지 않는다", () => {
    expect(errorCode(Object.assign(new Error("010-1234-5678 손님 조회 실패"), { digest: "2841977401" }))).toBe("2841977401");
    expect(errorCode(new Error("화면 오류"))).toBeNull();
    expect(errorCode("문자열")).toBeNull();
  });
});
