"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { OPTIONAL_CONSENTS } from "@/lib/privacy/texts";
import { clientKey } from "@/lib/public-guard";
import { parseSelfRegister } from "@/lib/customer/self-register";
import { kstYear } from "@/lib/customer/minor";

export type JoinState = { done?: boolean; message?: string; errors?: Record<string, string>; values?: Record<string, string> };

// 손님 셀프 등록. 토큰이 가리키는 샵에 카드를 만들 뿐 어떤 손님 정보도 돌려주지 않는다.
export async function joinShop(_prev: JoinState | undefined, formData: FormData): Promise<JoinState> {
  const token = String(formData.get("token") ?? "").slice(0, 100);
  const values = Object.fromEntries(
    ["name", "phone", "birth_year", "level", "equipment_size", "guardian_name", "guardian_phone"].map((k) => [k, String(formData.get(k) ?? "")]),
  );
  const parsed = parseSelfRegister(formData, kstYear(Date.now()));
  if (!parsed.ok) return { errors: parsed.errors, values };

  const admin = createAdminClient();
  const key = await clientKey();
  // 같은 기기(IP) 10분 10번, 같은 링크 하루 300번
  const [{ data: byIp }, { data: byToken }] = await Promise.all([
    admin.rpc("public_rate_limit", { p_key: `join-ip:${key}`, p_max: 10, p_window_seconds: 600 }),
    admin.rpc("public_rate_limit", { p_key: `join-token:${token.slice(0, 12)}`, p_max: 300, p_window_seconds: 86400 }),
  ]);
  if (byIp === false || byToken === false) return { message: "요청이 너무 많습니다. 잠시 후 다시 시도하거나 카운터에 말씀해 주세요.", values };

  const d = parsed.data;
  const { error } = await admin.rpc("public_register_customer", {
    p_token: token,
    p_name: d.name,
    p_phone: d.phone,
    p_birth_year: d.birthYear,
    p_level: d.level,
    p_equipment_size: d.equipmentSize,
    p_guardian_name: d.guardianName,
    p_guardian_phone: d.guardianPhone,
    p_marketing: d.marketing,
    p_photo: d.photo,
    p_method: "qr",
    p_marketing_version: OPTIONAL_CONSENTS.marketing.version,
    p_photo_version: OPTIONAL_CONSENTS.photo.version,
  });
  if (error) {
    return { message: error.message.includes("링크") ? "만료됐거나 폐기된 링크입니다. 카운터에 말씀해 주세요." : "등록하지 못했습니다. 입력을 확인해 주세요.", values };
  }
  return { done: true };
}
