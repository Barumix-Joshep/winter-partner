"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireArea } from "@/lib/auth/session";
import { getMyShop } from "@/lib/shop/my-shop";

// 그 달 승인 강습으로 정산을 (다시) 집계한다. 발행·지급된 정산서는 바뀌지 않는다.
export async function generate(formData: FormData) {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  const month = String(formData.get("month") ?? "");
  if (!shop || !/^\d{4}-\d{2}$/.test(month)) return;
  const supabase = await createClient();
  await supabase.rpc("generate_settlements", { p_shop_id: shop.id, p_month: `${month}-01` });
  revalidatePath("/shop/settlements");
}
