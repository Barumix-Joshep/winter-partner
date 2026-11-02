"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireArea } from "@/lib/auth/session";
import { getMyShop } from "@/lib/shop/my-shop";
import { parseShop } from "@/lib/shop/validate";
import type { ShopFormState } from "../new/actions";

// 샵 정보·영업 스키장 수정 (RLS: 샵 정보는 대표 관리자, 스키장은 샵 멤버)
export async function updateShop(_prev: ShopFormState | undefined, formData: FormData): Promise<ShopFormState> {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/shop/new");
  formData.set("type", shop.type);
  const parsed = parseShop(formData);
  if (!parsed.ok) return { errors: parsed.errors };
  const { name, businessNo, ownerName, resortIds } = parsed.data;

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("shops")
    .update({ name, business_no: businessNo, owner_name: ownerName })
    .eq("id", shop.id)
    .select("id");
  if (error) return { message: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  if (!updated?.length) return { message: "샵 정보는 대표 관리자만 바꿀 수 있습니다." };

  const current = shop.resorts.map((r) => r.id);
  const remove = current.filter((id) => !resortIds.includes(id));
  const add = resortIds.filter((id) => !current.includes(id));
  if (remove.length) await supabase.from("shop_resorts").delete().eq("shop_id", shop.id).in("resort_id", remove);
  if (add.length) await supabase.from("shop_resorts").insert(add.map((resort_id) => ({ shop_id: shop.id, resort_id })));

  revalidatePath("/shop", "layout");
  return { ok: true, message: "저장했습니다." };
}
