"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { OPTIONAL_CONSENTS } from "@/lib/privacy/texts";
import { clientKey } from "@/lib/public-guard";

export type ConsentState = { done?: boolean; message?: string };

// 손님(보호자) 본인이 링크에서 고른 선택 동의. 토큰이 가리키는 손님 하나에만 기록하고, 아무 정보도 돌려주지 않는다.
export async function submitConsent(_prev: ConsentState | undefined, formData: FormData): Promise<ConsentState> {
  const token = String(formData.get("token") ?? "");
  const admin = createAdminClient();
  const { data: allowed } = await admin.rpc("public_rate_limit", { p_key: `consent:${await clientKey()}`, p_max: 20, p_window_seconds: 600 });
  if (allowed === false) return { message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." };
  const { error } = await admin.rpc("public_submit_consent", {
    p_token: token,
    p_marketing: formData.get("marketing") === "on",
    p_photo: formData.get("photo") === "on",
    p_method: "link",
    p_marketing_version: OPTIONAL_CONSENTS.marketing.version,
    p_photo_version: OPTIONAL_CONSENTS.photo.version,
  });
  if (error) return { message: "만료됐거나 이미 쓴 링크입니다. 샵에 새 링크를 요청해 주세요." };
  return { done: true };
}
