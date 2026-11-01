"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireArea } from "@/lib/auth/session";
import { parseKstLocal } from "@/lib/shop/bid";

// 직접 의뢰 보내기. send_job_offer가 샵 멤버·상태·지급액·다른 샵 전속 여부를 확인한다.
export async function sendOffer(formData: FormData) {
  await requireArea("shop");
  const jobId = String(formData.get("job_id") ?? "");
  const supabase = await createClient();
  await supabase.rpc("send_job_offer", { p_job_id: jobId, p_instructor_id: String(formData.get("instructor_id") ?? "") });
  revalidatePath(`/shop/jobs/${jobId}`);
  revalidatePath("/shop/jobs");
}

// 입찰 공고 올리기 (마감은 한국 시간 datetime-local)
export async function publishBid(_prev: { message?: string } | undefined, formData: FormData) {
  await requireArea("shop");
  const jobId = String(formData.get("job_id") ?? "");
  const closesAt = parseKstLocal(String(formData.get("closes_at") ?? ""));
  if (!closesAt) return { message: "마감 시각을 골라 주세요." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_bid_job", {
    p_job_id: jobId,
    p_closes_at: closesAt,
    p_allow_team: formData.get("allow_team") === "on",
  });
  if (error) return { message: error.message.includes("마감") ? "마감은 지금 이후, 강습 시작 전이어야 합니다." : "공고하지 못했습니다. 상한가(강사 지급액)를 확인해 주세요." };
  revalidatePath(`/shop/jobs/${jobId}`);
  revalidatePath("/shop/jobs");
  return {};
}
