"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireArea } from "@/lib/auth/session";

// 직접 의뢰 보내기. send_job_offer가 샵 멤버·상태·지급액·다른 샵 전속 여부를 확인한다.
export async function sendOffer(formData: FormData) {
  await requireArea("shop");
  const jobId = String(formData.get("job_id") ?? "");
  const supabase = await createClient();
  await supabase.rpc("send_job_offer", { p_job_id: jobId, p_instructor_id: String(formData.get("instructor_id") ?? "") });
  revalidatePath(`/shop/jobs/${jobId}`);
  revalidatePath("/shop/jobs");
}
