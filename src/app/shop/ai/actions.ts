"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireArea } from "@/lib/auth/session";
import { getMyShop } from "@/lib/shop/my-shop";

export async function setShopAi(formData: FormData) {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) return;
  const supabase = await createClient();
  await supabase.rpc("set_shop_ai", { p_shop_id: shop.id, p_feature: String(formData.get("feature") ?? ""), p_enabled: formData.get("enabled") === "true" });
  revalidatePath("/shop/ai");
}
