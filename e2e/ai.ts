import { userClient } from "./helpers";

const FEATURES = ["intake", "cert", "bid_assist", "customer_summary", "note_tidy", "health_check", "revisit", "admin_query"];

// 플랫폼 기본값을 관리자 계정으로 켜고 끈다 (로컬 DB)
export async function setAiFeatures(on: boolean, only?: string[]) {
  const admin = await userClient("admin@winter.test");
  for (const f of only ?? FEATURES) {
    const { error } = await admin.rpc("set_ai_default", { p_feature: f, p_enabled: on });
    if (error) throw error;
  }
}
