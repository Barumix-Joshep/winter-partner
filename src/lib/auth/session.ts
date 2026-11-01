import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccess, homePathFor, type Area, type Role } from "./routing";

export type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role | null; // null: 역할을 아직 고르지 않음 (OAuth 가입)
  hasShop: boolean; // 샵 멤버인가 (샵 관리자)
};

// 로그인한 사용자. 없으면 /login으로 보낸다. 세션을 읽으므로 Suspense 안에서 부른다.
export async function getCurrentUser(): Promise<CurrentUser> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");

  const [{ data: profile }, { count }] = await Promise.all([
    supabase.from("profiles").select("name, role").eq("id", claims.sub).maybeSingle(),
    supabase.from("shop_members").select("shop_id", { count: "exact", head: true }).eq("user_id", claims.sub),
  ]);
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
    name: profile?.name ?? null,
    role: profile?.role ?? null,
    hasShop: (count ?? 0) > 0,
  };
}

// 이 구역에 들어올 역할이 아니면 자기 첫 화면으로 보낸다
export async function requireArea(area: Area): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!canAccess(user.role, area)) redirect(homePathFor(user));
  return user;
}
