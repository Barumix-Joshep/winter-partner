"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireArea } from "@/lib/auth/session";

// 플랫폼 기본값 켜기/끄기 (DB가 관리자만 허용)
export async function setAiDefault(formData: FormData) {
  await requireArea("admin");
  const supabase = await createClient();
  await supabase.rpc("set_ai_default", { p_feature: String(formData.get("feature") ?? ""), p_enabled: formData.get("enabled") === "true" });
  revalidatePath("/admin/ai");
}
