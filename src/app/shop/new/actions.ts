"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireArea } from "@/lib/auth/session";
import { parseShop } from "@/lib/shop/validate";

export type ShopFormState = { ok?: boolean; message?: string; errors?: Record<string, string | undefined> };

export async function registerShop(_prev: ShopFormState | undefined, formData: FormData): Promise<ShopFormState> {
  const user = await requireArea("shop");
  if (user.hasShop) redirect("/shop");

  const parsed = parseShop(formData);
  if (!parsed.ok) return { errors: parsed.errors };
  const { type, name, businessNo, ownerName, resortIds } = parsed.data;

  const supabase = await createClient();
  // 샵·영업 스키장·owner 등록을 한 트랜잭션으로 (supabase/migrations/*_create_shop.sql)
  const { error } = await supabase.rpc("create_shop", {
    p_type: type,
    p_name: name,
    p_business_no: businessNo,
    p_owner_name: ownerName,
    p_resort_ids: resortIds,
  });
  if (error) return { message: "등록하지 못했습니다. 잠시 후 다시 시도해 주세요." };

  redirect("/shop");
}
