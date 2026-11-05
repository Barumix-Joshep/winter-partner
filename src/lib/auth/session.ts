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
  termsAgreed: boolean; // 이용약관·개인정보 처리방침 동의
  sessionId: string; // 로그인 세션 (유휴 자동 로그아웃이 새 로그인을 구분할 때)
};

// 로그인한 사용자. 없으면 /login으로 보낸다. 세션을 읽으므로 Suspense 안에서 부른다.
export async function getCurrentUser(): Promise<CurrentUser> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");

  const [{ data: profile }, { count }] = await Promise.all([
    supabase.from("profiles").select("name, role, terms_agreed_at").eq("id", claims.sub).maybeSingle(),
    supabase.from("shop_members").select("shop_id", { count: "exact", head: true }).eq("user_id", claims.sub),
  ]);
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
    name: profile?.name ?? null,
    role: profile?.role ?? null,
    hasShop: (count ?? 0) > 0,
    termsAgreed: !!profile?.terms_agreed_at,
    sessionId: typeof claims.session_id === "string" ? claims.session_id : "",
  };
}

// 이 구역에 들어올 역할이 아니면 자기 첫 화면으로 보낸다
export async function requireArea(area: Area): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!canAccess(user.role, area)) redirect(homePathFor(user));
  return user;
}
