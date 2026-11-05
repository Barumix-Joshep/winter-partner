import { describe, expect, it } from "vitest";
import { IDLE_LIMIT_MS, isIdle, parseLastActive } from "./idle";

describe("유휴 자동 로그아웃 기준", () => {
  it("관리자일수록 짧다", () => {
    expect(IDLE_LIMIT_MS.admin).toBeLessThan(IDLE_LIMIT_MS.shop);
    expect(IDLE_LIMIT_MS.shop).toBeLessThan(IDLE_LIMIT_MS.instructor);
  });

  it("같은 세션에서 기준을 넘기면 유휴", () => {
    const last = { at: 0, sid: "s1" };
    expect(isIdle(last, "s1", IDLE_LIMIT_MS.shop + 1, IDLE_LIMIT_MS.shop)).toBe(true);
    expect(isIdle(last, "s1", IDLE_LIMIT_MS.shop, IDLE_LIMIT_MS.shop)).toBe(false);
  });

  it("기록이 없거나 다른 세션(새 로그인)의 기록이면 유휴가 아니다", () => {
    expect(isIdle(null, "s1", 10 ** 12, 1)).toBe(false);
    expect(isIdle({ at: 0, sid: "old" }, "s1", 10 ** 12, 1)).toBe(false);
  });

  it("깨진 값은 기록 없음으로 본다", () => {
    expect(parseLastActive(null)).toBeNull();
    expect(parseLastActive("123")).toBeNull();
    expect(parseLastActive("{")).toBeNull();
    expect(parseLastActive('{"at":5,"sid":"s"}')).toEqual({ at: 5, sid: "s" });
  });
});
