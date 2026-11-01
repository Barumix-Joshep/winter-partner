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

// 정산서 발행: 그 달 집계(draft)를 확정한다. 발행 뒤에는 다시 집계해도 금액이 바뀌지 않는다.
export async function issue(formData: FormData) {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  const month = String(formData.get("month") ?? "");
  if (!shop || !/^\d{4}-\d{2}$/.test(month)) return;
  const supabase = await createClient();
  await supabase.from("settlements").update({ status: "issued" }).eq("shop_id", shop.id).eq("month", `${month}-01`).eq("status", "draft");
  revalidatePath("/shop/settlements");
}

// 지급 완료 체크·취소 (송금은 직접 하고 여기서는 표시만)
export async function setPaid(formData: FormData) {
  await requireArea("shop");
  const supabase = await createClient();
  await supabase.rpc("set_settlement_paid", {
    p_settlement_id: String(formData.get("id") ?? ""),
    p_paid: formData.get("paid") === "true",
  });
  revalidatePath("/shop/settlements");
}
