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
  // 승인된 샵이 이미 적힌 사업자번호를 바꾸면 본사 승인 요청으로 돌린다 (P19-2). 처음 적는 것은 바로 저장.
  const { data: cur } = await supabase.from("shops").select("business_no").eq("id", shop.id).single();
  const needsApproval = shop.status === "approved" && !!cur?.business_no && businessNo !== cur.business_no;
  const { data: updated, error } = await supabase
    .from("shops")
    .update(needsApproval ? { name, owner_name: ownerName } : { name, business_no: businessNo, owner_name: ownerName })
    .eq("id", shop.id)
    .select("id");
  if (error) return { message: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  if (!updated?.length) return { message: "샵 정보는 대표 관리자만 바꿀 수 있습니다." };
  let requested = false;
  if (needsApproval) {
    const { error: reqError } = await supabase.rpc("request_shop_change", { p_shop_id: shop.id, p_type: null, p_business_no: businessNo ?? "" });
    if (reqError) return { message: "사업자번호 변경 요청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요." };
    requested = true;
  }

  const current = shop.resorts.map((r) => r.id);
  const remove = current.filter((id) => !resortIds.includes(id));
  const add = resortIds.filter((id) => !current.includes(id));
  if (remove.length) await supabase.from("shop_resorts").delete().eq("shop_id", shop.id).in("resort_id", remove);
  if (add.length) await supabase.from("shop_resorts").insert(add.map((resort_id) => ({ shop_id: shop.id, resort_id })));

  revalidatePath("/shop", "layout");
  return {
    ok: true,
    message: requested ? "저장했습니다. 사업자번호 변경은 본사가 확인한 뒤 반영됩니다." : "저장했습니다.",
  };
}
