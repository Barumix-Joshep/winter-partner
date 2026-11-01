"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireArea } from "@/lib/auth/session";

// 자격증 승인·반려. review_cert가 본사만 허용하고 강사 검증 상태도 맞춘다.
export async function reviewCert(formData: FormData) {
  await requireArea("admin");
  const id = String(formData.get("id") ?? "");
  const approve = formData.get("decision") === "approve";
  const supabase = await createClient();
  await supabase.rpc("review_cert", { p_cert_id: id, p_approve: approve });
  revalidatePath("/admin");
}
