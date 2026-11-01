import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
  role: "platform_admin" | "shop_admin" | "instructor" | null; // null: 역할을 아직 고르지 않음 (OAuth 가입)
};

// 로그인한 사용자. 없으면 /login으로 보낸다. 세션을 읽으므로 Suspense 안에서 부른다.
export async function getCurrentUser(): Promise<CurrentUser> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("name, role").eq("id", claims.sub).maybeSingle();
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
    name: profile?.name ?? null,
    role: profile?.role ?? null,
  };
}
