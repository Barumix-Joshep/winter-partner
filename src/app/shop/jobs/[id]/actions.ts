"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notifyAfterResponse } from "@/lib/notify/dispatch";
import { requireArea } from "@/lib/auth/session";
import { parseKstLocal } from "@/lib/shop/bid";
import { wonRangeError } from "@/lib/shop/job";

// 직접 의뢰 보내기. send_job_offer가 샵 멤버·상태·지급액·다른 샵 전속 여부를 확인한다.
export async function sendOffer(formData: FormData) {
  await requireArea("shop");
  notifyAfterResponse(); // 이 작업이 쌓는 알림을 응답 뒤에 보낸다
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
  notifyAfterResponse(); // 이 작업이 쌓는 알림을 응답 뒤에 보낸다
  const jobId = String(formData.get("job_id") ?? "");
  const raw = String(formData.get("final_rate") ?? "").replace(/,/g, "").trim();
  if (!/^\d+$/.test(raw) || Number(raw) <= 0) return { message: "확정 금액을 숫자로 입력해 주세요." };
  const range = wonRangeError(Number(raw), "확정 금액은");
  if (range) return { message: range };
  const supabase = await createClient();
  const { error } = await supabase.rpc("select_bid", { p_bid_id: String(formData.get("bid_id") ?? ""), p_final_rate: Number(raw) });
  if (error) {
    if (error.message.includes("같은 시간")) return { message: "이 강사는 그 사이 같은 시간 강습이 확정됐습니다. 다른 입찰을 골라 주세요." };
    if (error.message.includes("전속")) return { message: "이 강사는 그 사이 전속 강사가 돼 선정할 수 없습니다. 다른 입찰을 골라 주세요." };
    return { message: "선정하지 못했습니다. 새로고침 후 다시 시도해 주세요." };
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
  notifyAfterResponse(); // 이 작업이 쌓는 알림을 응답 뒤에 보낸다
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

// 손님 취소·샵 사정 취소. 배정 강사에게 바로 알림이 가고, 정산에서 빠진다.
export async function cancelJob(_prev: { message?: string } | undefined, formData: FormData) {
  await requireArea("shop");
  notifyAfterResponse(); // 이 작업이 쌓는 알림을 응답 뒤에 보낸다
  const jobId = String(formData.get("job_id") ?? "");
  const by = formData.get("by") === "shop" ? "shop" : "customer";
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_job", { p_job_id: jobId, p_by: by, p_reason: String(formData.get("reason") ?? "").slice(0, 200) });
  if (error) return { message: "취소하지 못했습니다. 완료 보고된 강습은 취소할 수 없습니다." };
  revalidatePath(`/shop/jobs/${jobId}`);
  revalidatePath("/shop/jobs");
  return {};
}

// 승인된 강습 정정 (P19-2). correct_approved_lesson이 권한·발행 여부·시간 겹침을 확인하고 이력을 남긴다.
// 자정을 넘는 강습은 끝 시각이 시작보다 이르면 다음 날로 본다(P19-3과 같은 규칙).
export async function correctLesson(_prev: { message?: string; ok?: boolean } | undefined, formData: FormData) {
  await requireArea("shop");
  const jobId = String(formData.get("job_id") ?? "");
  const date = String(formData.get("date") ?? "");
  const start = String(formData.get("start") ?? "");
  const end = String(formData.get("end") ?? "");
  const raw = String(formData.get("final_rate") ?? "").replace(/,/g, "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return { message: "날짜와 시간을 확인해 주세요." };
  if (start === end) return { message: "끝나는 시간은 시작과 달라야 합니다." };
  if (!/^\d+$/.test(raw)) return { message: "강사 지급액은 숫자로 입력해 주세요." };
  const range = wonRangeError(Number(raw), "강사 지급액은");
  if (range) return { message: range };
  if (!reason) return { message: "정정 사유를 적어 주세요." };
  const startsAt = new Date(`${date}T${start}:00+09:00`);
  const endsAt = new Date(`${date}T${end}:00+09:00`);
  if (endsAt <= startsAt) endsAt.setTime(endsAt.getTime() + 86400_000);
  const supabase = await createClient();
  const { error } = await supabase.rpc("correct_approved_lesson", {
    p_job_id: jobId,
    p_starts: startsAt.toISOString(),
    p_ends: endsAt.toISOString(),
    p_final_rate: Number(raw),
    p_reason: reason,
  });
  if (error) {
    for (const m of ["발행된 정산서", "다른 강습", "정정 사유", "1,000만"]) if (error.message.includes(m)) return { message: error.message };
    return { message: "정정하지 못했습니다. 새로고침 후 다시 시도해 주세요." };
  }
  revalidatePath(`/shop/jobs/${jobId}`);
  revalidatePath("/shop/settlements");
  return { ok: true, message: "정정했습니다. 정산 화면에서 다시 집계해 주세요." };
}
