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

// 승인된 샵의 유형·사업자번호 변경 요청 결정 (P19-2). decide_shop_change가 본사만 허용한다.
export async function decideShopChange(formData: FormData) {
  await requireArea("admin");
  const supabase = await createClient();
  await supabase.rpc("decide_shop_change", {
    p_request_id: String(formData.get("id") ?? ""),
    p_approve: formData.get("decision") === "approve",
  });
  revalidatePath("/admin");
}
