"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireArea } from "@/lib/auth/session";
import { getMyShop } from "@/lib/shop/my-shop";

// 시작 체크리스트 닫기·다시 열기
export async function setOnboardingHidden(formData: FormData) {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) return;
  const supabase = await createClient();
  await supabase.rpc("set_onboarding_hidden", { p_shop_id: shop.id, p_hidden: formData.get("hidden") === "true" });
  revalidatePath("/shop");
}
