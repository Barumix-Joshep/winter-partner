import { describe, expect, it } from "vitest";
import { errorDetail } from "./event";

describe("errorDetail", () => {
  it("오류 이름과 메시지를 짧게 남긴다", () => {
    expect(errorDetail(new TypeError("x is undefined"))).toBe("TypeError: x is undefined");
  });
  it("연락처·이메일은 지운다", () => {
    const d = errorDetail(new Error("duplicate 010-1234-5678 kim@test.com"));
    expect(d).not.toMatch(/1234|kim@/);
    expect(d).toContain("[전화]");
  });
  it("digest가 있으면 붙인다(React가 감춘 메시지)", () => {
    const e = Object.assign(new Error("An error occurred in the Server Components render."), { digest: "12345" });
    expect(errorDetail(e)).toContain("digest 12345");
  });
  it("Error가 아니어도 문자열로", () => {
    expect(errorDetail("boom")).toBe("boom");
  });
  it("300자로 자른다", () => {
    expect(errorDetail(new Error("a".repeat(1000))).length).toBeLessThanOrEqual(300);
  });
});
