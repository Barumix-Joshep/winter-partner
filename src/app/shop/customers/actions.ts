"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireArea } from "@/lib/auth/session";
import { getMyShop } from "@/lib/shop/my-shop";
import { parseCustomer } from "@/lib/customer/validate";
import { parseContact } from "@/lib/customer/contact";
import { siteOrigin } from "@/lib/origin";
import { kstYear } from "@/lib/customer/minor";
import { detectHealthTerms, healthWarning } from "@/lib/privacy/health";

// values: 검증에 실패했을 때 입력값을 돌려준다 (React 19 폼은 제출 뒤 입력 칸을 비운다)
export type CustomerFormState = { ok?: boolean; message?: string; errors?: Record<string, string | undefined>; values?: Record<string, string> };

function formValues(fd: FormData) {
  return Object.fromEntries([...fd.entries()].filter(([k, v]) => typeof v === "string" && !k.startsWith("$")).map(([k, v]) => [k, v as string]));
}

// 손님 등록·수정 (RLS: 우리 샵 손님만)
export async function saveCustomer(_prev: CustomerFormState | undefined, formData: FormData): Promise<CustomerFormState> {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/shop/new");
  const parsed = parseCustomer(formData, kstYear(Date.now()));
  if (!parsed.ok) return { errors: parsed.errors, values: formValues(formData) };

  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const fields = parsed.data;
  const health = detectHealthTerms(fields.memo);
  if (id) {
    const { error } = await supabase.from("customers").update(fields).eq("id", id).eq("shop_id", shop.id);
    if (error) return { message: "저장하지 못했습니다." };
    if (health.length) await supabase.rpc("record_health_warning", { p_field: "customer_memo", p_customer_id: id, p_job_id: null, p_terms: health });
    revalidatePath("/shop/customers");
    return health.length ? { ok: false, message: healthWarning(health) } : { ok: true, message: "저장했습니다." };
  }
  const { data, error } = await supabase
    .from("customers")
    .insert({ ...fields, shop_id: shop.id, owner_user_id: user.id })
    .select("id")
    .single();
  if (error || !data) return { message: "등록하지 못했습니다." };
  if (health.length) {
    await supabase.rpc("record_health_warning", { p_field: "customer_memo", p_customer_id: data.id, p_job_id: null, p_terms: health });
  }
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
  const health = detectHealthTerms(parsed.data.memo);
  if (health.length) {
    await supabase.rpc("record_health_warning", { p_field: "contact_memo", p_customer_id: id, p_job_id: null, p_terms: health });
    return { ok: false, message: `연락을 기록했습니다. ${healthWarning(health)}` };
  }
  return { ok: true, message: "연락을 기록했습니다." };
}

export async function deleteContact(formData: FormData) {
  await requireArea("shop");
  const supabase = await createClient();
  await supabase.from("customer_contacts").delete().eq("id", String(formData.get("contact_id") ?? ""));
  revalidatePath("/shop/customers");
}

// 선택 동의의 직원 기록 (현장에서 들은 동의는 무효로 남고, 철회는 효력이 있다)
export async function recordStaffConsent(formData: FormData) {
  await requireArea("shop");
  const kind = String(formData.get("kind") ?? "");
  if (kind !== "marketing" && kind !== "photo") return;
  const supabase = await createClient();
  await supabase.rpc("record_staff_consent", {
    p_customer_id: String(formData.get("id") ?? ""),
    p_kind: kind,
    p_granted: formData.get("granted") === "true",
  });
  revalidatePath("/shop/customers");
}

// 손님(14세 미만은 보호자)이 직접 선택 동의를 고르는 1회용 링크 (7일). 원문 토큰은 이때 한 번만 보인다.
export async function createConsentLink(_prev: { url?: string; message?: string } | undefined, formData: FormData) {
  await requireArea("shop");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_consent_link", { p_customer_id: String(formData.get("id") ?? "") });
  if (error || !data) return { message: "링크를 만들지 못했습니다." };
  return { url: `${await siteOrigin()}/consent/${data}` };
}

// 셀프 등록 카드를 기존 카드로 합치거나(되돌릴 수 없음) 따로 둔다
export async function mergeCustomer(formData: FormData) {
  await requireArea("shop");
  const keep = String(formData.get("keep") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("merge_customers", { p_keep: keep, p_dup: String(formData.get("dup") ?? "") });
  revalidatePath("/shop/customers");
  if (!error) redirect(`/shop/customers?id=${keep}`);
}

export async function dismissMerge(formData: FormData) {
  await requireArea("shop");
  const supabase = await createClient();
  await supabase.rpc("dismiss_merge", { p_id: String(formData.get("id") ?? "") });
  revalidatePath("/shop/customers");
}

// 손님 삭제 요청: 즉시 익명화 (되돌릴 수 없음). 확인 문구 '익명화'를 직접 입력해야 한다.
export async function eraseCustomer(_prev: { message?: string } | undefined, formData: FormData) {
  await requireArea("shop");
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("erase_customer", { p_customer_id: id, p_confirm: String(formData.get("confirm") ?? "") });
  if (error) return { message: error.message.includes("확인 문구") ? "확인 문구 '익명화'를 정확히 입력해 주세요." : "처리하지 못했습니다." };
  revalidatePath("/shop/customers");
  redirect(`/shop/customers?id=${id}`);
}
