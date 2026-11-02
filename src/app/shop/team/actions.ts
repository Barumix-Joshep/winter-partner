"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireArea } from "@/lib/auth/session";
import { getMyShop } from "@/lib/shop/my-shop";
import { isPayType } from "@/lib/settlement/pay-type";

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

// 전속 강사 지급 방식 (P19-1). 세무 판단은 샵이 하고, 플랫폼은 정산서에 기록·표시만 한다. 이력은 RPC가 남긴다.
export async function setPayType(formData: FormData) {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  const payType = formData.get("pay_type");
  if (!shop || !isPayType(payType)) return;
  const supabase = await createClient();
  await supabase.rpc("set_instructor_pay_type", {
    p_shop_id: shop.id,
    p_instructor_id: String(formData.get("instructor_id") ?? ""),
    p_pay_type: payType,
  });
  revalidatePath("/shop/team");
}
