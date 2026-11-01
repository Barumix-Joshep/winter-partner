"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireArea } from "@/lib/auth/session";
import { getMyShop } from "@/lib/shop/my-shop";
import { parseCustomer } from "@/lib/customer/validate";
import { parseContact } from "@/lib/customer/contact";

export type CustomerFormState = { ok?: boolean; message?: string; errors?: Record<string, string | undefined> };

// 손님 등록·수정 (RLS: 우리 샵 손님만)
export async function saveCustomer(_prev: CustomerFormState | undefined, formData: FormData): Promise<CustomerFormState> {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/shop/new");
  const parsed = parseCustomer(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const { privacy_consent, ...fields } = parsed.data;
  const now = new Date().toISOString();
  if (id) {
    const { data: prev } = await supabase.from("customers").select("privacy_consent_at").eq("id", id).maybeSingle();
    const privacy_consent_at = privacy_consent ? (prev?.privacy_consent_at ?? now) : null;
    const { error } = await supabase.from("customers").update({ ...fields, privacy_consent_at }).eq("id", id).eq("shop_id", shop.id);
    if (error) return { message: "저장하지 못했습니다." };
    revalidatePath("/shop/customers");
    return { ok: true, message: "저장했습니다." };
  }
  const { data, error } = await supabase
    .from("customers")
    .insert({ ...fields, privacy_consent_at: privacy_consent ? now : null, shop_id: shop.id, owner_user_id: user.id })
    .select("id")
    .single();
  if (error || !data) return { message: "등록하지 못했습니다." };
  redirect(`/shop/customers?id=${data.id}`);
}

// 일행 묶기·풀기 (가족·친구)
export async function linkCustomer(formData: FormData) {
  await requireArea("shop");
  const a = String(formData.get("id") ?? "");
  const b = String(formData.get("other") ?? "");
  if (!a || !b || a === b) return;
  const supabase = await createClient();
  await supabase.from("customer_links").insert({ customer_id: a, linked_customer_id: b });
  revalidatePath("/shop/customers");
}

export async function unlinkCustomer(formData: FormData) {
  await requireArea("shop");
  const a = String(formData.get("id") ?? "");
  const b = String(formData.get("other") ?? "");
  const supabase = await createClient();
  await supabase.from("customer_links").delete().or(`and(customer_id.eq.${a},linked_customer_id.eq.${b}),and(customer_id.eq.${b},linked_customer_id.eq.${a})`);
  revalidatePath("/shop/customers");
}

// 연락 기록 + 다음 연락일·목적 (log_customer_contact가 우리 샵 손님인지 다시 확인한다)
export async function logContact(_prev: CustomerFormState | undefined, formData: FormData): Promise<CustomerFormState> {
  await requireArea("shop");
  const parsed = parseContact(formData);
  if (!parsed.ok) return { message: parsed.message };
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("log_customer_contact", {
    p_customer_id: id,
    p_channel: parsed.data.channel,
    p_memo: parsed.data.memo,
    p_next_on: parsed.data.nextOn,
    p_next_note: parsed.data.nextNote,
  });
  revalidatePath("/shop/customers");
  if (error) return { message: "기록하지 못했습니다. 새로고침 후 다시 시도해 주세요." };
  return { ok: true, message: "연락을 기록했습니다." };
}

export async function deleteContact(formData: FormData) {
  await requireArea("shop");
  const supabase = await createClient();
  await supabase.from("customer_contacts").delete().eq("id", String(formData.get("contact_id") ?? ""));
  revalidatePath("/shop/customers");
}
