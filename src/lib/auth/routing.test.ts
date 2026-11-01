import { describe, expect, it } from "vitest";
import { canAccess, homePathFor } from "./routing";

describe("homePathFor", () => {
  it("역할별 첫 화면으로 보낸다", () => {
    expect(homePathFor({ role: "platform_admin", hasShop: false })).toBe("/admin");
    expect(homePathFor({ role: "shop_admin", hasShop: true })).toBe("/shop");
    expect(homePathFor({ role: "instructor", hasShop: false })).toBe("/instructor");
  });

  it("샵이 없는 샵 관리자는 샵 등록으로 보낸다", () => {
    expect(homePathFor({ role: "shop_admin", hasShop: false })).toBe("/shop/new");
  });

  it("역할이 없으면(카카오 첫 로그인) 역할 선택으로 보낸다", () => {
    expect(homePathFor({ role: null, hasShop: false })).toBe("/onboarding");
  });
});

describe("canAccess", () => {
  it("자기 역할의 구역만 들어간다", () => {
    expect(canAccess("shop_admin", "shop")).toBe(true);
    expect(canAccess("instructor", "shop")).toBe(false);
    expect(canAccess("shop_admin", "instructor")).toBe(false);
    expect(canAccess("instructor", "admin")).toBe(false);
    expect(canAccess(null, "instructor")).toBe(false);
  });

  it("플랫폼 관리자도 샵·강사 구역에는 들어가지 않는다 (손님 정보 보호)", () => {
    expect(canAccess("platform_admin", "admin")).toBe(true);
    expect(canAccess("platform_admin", "shop")).toBe(false);
  });
});
