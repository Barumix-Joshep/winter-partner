import "server-only";
import { createClient } from "@/lib/supabase/server";

export type MyShop = {
  id: string;
  name: string;
  type: "rental_shop" | "lesson_team";
  status: "pending" | "approved" | "rejected";
  resorts: { id: number; name: string }[];
};

// 로그인한 샵 관리자의 샵 (1단계는 하나)
export async function getMyShop(userId: string): Promise<MyShop | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shop_members")
    .select("shops(id, name, type, status, shop_resorts(resorts(id, name)))")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  const s = data?.shops as unknown as
    | { id: string; name: string; type: MyShop["type"]; status: MyShop["status"]; shop_resorts: { resorts: { id: number; name: string } }[] }
    | null;
  if (!s) return null;
  return {
    id: s.id,
    name: s.name,
    type: s.type,
    status: s.status,
    resorts: s.shop_resorts.map((r) => r.resorts).sort((a, b) => a.id - b.id),
  };
}
