"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireArea } from "@/lib/auth/session";
import { getMyShop } from "@/lib/shop/my-shop";
import { activeTotal, KB_ACTIVE_TOTAL_MAX, parseKnowledge } from "@/lib/ai/consult/knowledge";

export type KbState = { ok?: boolean; message?: string };
const PATH = "/shop/ai-consult/knowledge";

async function myShopId() {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  return shop?.id ?? null;
}

// 안내 정보 저장(id 있으면 고치기, 없으면 추가). RLS member_all이 자기 샵만 허용한다.
export async function saveKnowledge(_prev: KbState | undefined, formData: FormData): Promise<KbState> {
  const shopId = await myShopId();
  if (!shopId) return { message: "샵 정보를 찾지 못했습니다." };
  const parsed = parseKnowledge(formData);
  if (!parsed.ok) return { message: parsed.message };
  const id = String(formData.get("id") ?? "") || null;
  const supabase = await createClient();
  const { data: items } = await supabase.from("shop_knowledge").select("id, content, is_active").eq("shop_id", shopId);
  if (activeTotal(items ?? [], { id, content: parsed.data.content, isActive: parsed.data.isActive }) > KB_ACTIVE_TOTAL_MAX) {
    return { message: `사용 중인 안내 정보가 모두 합쳐 ${KB_ACTIVE_TOTAL_MAX.toLocaleString()}자를 넘습니다. 다른 항목을 줄이거나 꺼 주세요.` };
  }
  const row = { kind: parsed.data.kind, title: parsed.data.title, content: parsed.data.content, is_active: parsed.data.isActive };
  const { error } = id
    ? await supabase.from("shop_knowledge").update(row).eq("id", id).eq("shop_id", shopId)
    : await supabase.from("shop_knowledge").insert({ ...row, shop_id: shopId, sort: 1000 });
  if (error) return { message: "저장하지 못했습니다. 다시 시도해 주세요." };
  revalidatePath(PATH);
  return { ok: true, message: "저장했습니다." };
}

export async function deleteKnowledge(formData: FormData) {
  const shopId = await myShopId();
  if (!shopId) return;
  const supabase = await createClient();
  await supabase.from("shop_knowledge").delete().eq("id", String(formData.get("id") ?? "")).eq("shop_id", shopId);
  revalidatePath(PATH);
}

// AI 자동응답 켜기·끄기 (감사 기록은 RPC가 남긴다)
export async function setAutoReply(formData: FormData) {
  const shopId = await myShopId();
  if (!shopId) return;
  const supabase = await createClient();
  await supabase.rpc("set_consult_settings", { p_shop_id: shopId, p_auto_reply: formData.get("enabled") === "true", p_disclosure: null, p_disclose_first: null });
  revalidatePath(PATH);
}

export async function saveDisclosure(_prev: KbState | undefined, formData: FormData): Promise<KbState> {
  const shopId = await myShopId();
  if (!shopId) return { message: "샵 정보를 찾지 못했습니다." };
  const text = String(formData.get("disclosure") ?? "").trim();
  if (!text || text.length > 300) return { message: "고지 문구는 1~300자로 적어 주세요." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_consult_settings", {
    p_shop_id: shopId,
    p_auto_reply: null,
    p_disclosure: text,
    p_disclose_first: formData.get("disclose_first") === "on",
  });
  if (error) return { message: "저장하지 못했습니다." };
  revalidatePath(PATH);
  return { ok: true, message: "저장했습니다." };
}

// 인스타그램 연결 해제 (P22-4). 토큰·계정 id를 지우고 끈다. 감사 기록은 RPC가 남긴다. 대화 기록은 남는다.
export async function disconnectInstagram() {
  const shopId = await myShopId();
  if (!shopId) return;
  const supabase = await createClient();
  await supabase.rpc("consult_disconnect_channel", { p_shop_id: shopId, p_channel: "instagram" });
  revalidatePath(PATH);
}
