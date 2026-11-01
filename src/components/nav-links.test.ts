import { describe, expect, it } from "vitest";
import { isActive } from "./nav-links";

describe("isActive", () => {
  it("구역 첫 화면은 정확히 그 주소일 때만", () => {
    expect(isActive("/shop", "/shop", "/shop")).toBe(true);
    expect(isActive("/shop/jobs", "/shop", "/shop")).toBe(false);
  });
  it("나머지 메뉴는 하위 화면에서도 켜진다", () => {
    expect(isActive("/shop/jobs/abc", "/shop/jobs", "/shop")).toBe(true);
    expect(isActive("/shop/jobs", "/shop/jobs", "/shop")).toBe(true);
    expect(isActive("/shop/jobsx", "/shop/jobs", "/shop")).toBe(false);
  });
});
