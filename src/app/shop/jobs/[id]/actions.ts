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

// 입찰 선정 (금액 조정 가능). select_bid가 권한·상태·시간 겹침을 확인한다.
export async function selectBid(_prev: { message?: string } | undefined, formData: FormData) {
  await requireArea("shop");
  const jobId = String(formData.get("job_id") ?? "");
  const raw = String(formData.get("final_rate") ?? "").replace(/,/g, "").trim();
  if (!/^\d+$/.test(raw) || Number(raw) <= 0) return { message: "확정 금액을 숫자로 입력해 주세요." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("select_bid", { p_bid_id: String(formData.get("bid_id") ?? ""), p_final_rate: Number(raw) });
  if (error) {
    return { message: error.message.includes("같은 시간") ? "이 강사는 그 사이 같은 시간 강습이 확정됐습니다. 다른 입찰을 골라 주세요." : "선정하지 못했습니다. 새로고침 후 다시 시도해 주세요." };
  }
  revalidatePath(`/shop/jobs/${jobId}`);
  revalidatePath("/shop/jobs");
  return {};
}

export async function unpublishBid(formData: FormData) {
  await requireArea("shop");
  const jobId = String(formData.get("job_id") ?? "");
  const supabase = await createClient();
  await supabase.rpc("unpublish_bid_job", { p_job_id: jobId });
  revalidatePath(`/shop/jobs/${jobId}`);
  revalidatePath("/shop/jobs");
}

// 완료 보고 승인 (평가 선택)
export async function approveLesson(_prev: { message?: string } | undefined, formData: FormData) {
  await requireArea("shop");
  const jobId = String(formData.get("job_id") ?? "");
  const raw = String(formData.get("score") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_lesson", {
    p_job_id: jobId,
    p_score: /^[1-5]$/.test(raw) ? Number(raw) : null,
    p_memo: String(formData.get("memo") ?? "").slice(0, 300),
  });
  if (error) return { message: "승인하지 못했습니다. 새로고침 후 다시 시도해 주세요." };
  revalidatePath(`/shop/jobs/${jobId}`);
  revalidatePath("/shop/jobs");
  return {};
}
