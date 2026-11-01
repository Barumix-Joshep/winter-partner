"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { requireArea } from "@/lib/auth/session";
import { getMyShop } from "@/lib/shop/my-shop";
import { siteOrigin } from "@/lib/origin";

export type LinkState = { url?: string; svg?: string; label?: string; message?: string };

// 등록 링크 발급. 원문 토큰은 지금 한 번만 보인다(DB에는 해시만) → 바로 인쇄하거나 주소를 복사한다.
export async function createLink(_prev: LinkState | undefined, formData: FormData): Promise<LinkState> {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) return { message: "샵을 먼저 등록해 주세요." };
  const label = String(formData.get("label") ?? "").trim().slice(0, 40) || "카운터";
  const days = Number(formData.get("days") ?? 120);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_registration_link", { p_shop_id: shop.id, p_label: label, p_days: days });
  revalidatePath("/shop/register-qr");
  if (error || !data) return { message: "링크를 만들지 못했습니다. 유효 기간(1~180일)을 확인해 주세요." };
  const url = `${await siteOrigin()}/join/${data}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0F1E3D", light: "#FFFFFF" } });
  return { url, svg, label };
}

export async function revokeLink(formData: FormData) {
  await requireArea("shop");
  const supabase = await createClient();
  await supabase.rpc("revoke_registration_link", { p_id: String(formData.get("id") ?? "") });
  revalidatePath("/shop/register-qr");
}
