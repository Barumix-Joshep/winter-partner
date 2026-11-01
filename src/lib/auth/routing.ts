// 역할 분기 규칙 (페이지 가드와 첫 화면 결정에 쓴다). 데이터 보호는 RLS가 맡고, 이건 화면 길 안내다.

export type Role = "platform_admin" | "shop_admin" | "instructor";
export type Area = "admin" | "shop" | "instructor";

const AREA_ROLE: Record<Area, Role> = { admin: "platform_admin", shop: "shop_admin", instructor: "instructor" };

export function homePathFor({ role, hasShop }: { role: Role | null; hasShop: boolean }) {
  switch (role) {
    case "platform_admin":
      return "/admin";
    case "shop_admin":
      return hasShop ? "/shop" : "/shop/new";
    case "instructor":
      return "/instructor";
    default:
      return "/onboarding";
  }
}

export function canAccess(role: Role | null, area: Area) {
  return role !== null && AREA_ROLE[area] === role;
}
