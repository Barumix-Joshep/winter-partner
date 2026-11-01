"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireArea } from "@/lib/auth/session";
import { getMyShop } from "@/lib/shop/my-shop";

// 전속 제안·취소·해지. 권한은 RLS가 확인한다 (승인된 샵, 다른 샵 전속이 아닌 강사).
export async function proposeExclusive(formData: FormData) {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) return;
  const supabase = await createClient();
  await supabase
    .from("exclusive_invites")
    .insert({ shop_id: shop.id, instructor_id: String(formData.get("instructor_id") ?? "") });
  revalidatePath("/shop/instructors");
  revalidatePath("/shop/team");
}

export async function cancelInvite(formData: FormData) {
  await requireArea("shop");
  const supabase = await createClient();
  await supabase.from("exclusive_invites").update({ status: "canceled" }).eq("id", String(formData.get("id") ?? ""));
  revalidatePath("/shop/team");
}

export async function releaseExclusive(formData: FormData) {
  await requireArea("shop");
  const supabase = await createClient();
  await supabase.from("shop_instructors").delete().eq("instructor_id", String(formData.get("instructor_id") ?? ""));
  revalidatePath("/shop/team");
}
