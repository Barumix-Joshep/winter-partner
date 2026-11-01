"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { notifyAfterResponse } from "@/lib/notify/dispatch";
import { requireArea } from "@/lib/auth/session";
import { withNotice } from "@/lib/instructor/notice";

// 전속 제안 수락은 함수로 (전속 등록·진행 중 입찰 철회·다른 제안 거절을 한 번에)
export async function acceptInvite(formData: FormData) {
  await requireArea("instructor");
  const supabase = await createClient();
  await supabase.rpc("accept_exclusive_invite", { p_invite_id: String(formData.get("id") ?? "") });
  revalidatePath("/instructor");
}

export async function declineInvite(formData: FormData) {
  await requireArea("instructor");
  const supabase = await createClient();
  await supabase
    .from("exclusive_invites")
    .update({ status: "declined", responded_at: new Date().toISOString() })
    .eq("id", String(formData.get("id") ?? ""));
  revalidatePath("/instructor");
}

// 강사 본인이 전속을 끝낸다 (RLS self_leave)
export async function leaveExclusive() {
  await requireArea("instructor");
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const { data: me } = await supabase.from("instructors").select("id").eq("user_id", data?.claims?.sub ?? "").maybeSingle();
  if (me) await supabase.from("shop_instructors").delete().eq("instructor_id", me.id);
  revalidatePath("/instructor");
}

// 직접 의뢰 응답. respond_job_offer가 본인·만료·시간 충돌을 확인하고 배정을 만든다.
export async function respondOffer(_prev: { message?: string } | undefined, formData: FormData) {
  await requireArea("instructor");
  notifyAfterResponse(); // 이 작업이 쌓는 알림을 응답 뒤에 보낸다
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_job_offer", {
    p_offer_id: String(formData.get("id") ?? ""),
    p_accept: formData.get("decision") === "accept",
  });
  revalidatePath("/instructor");
  if (error) {
    return { message: error.message.includes("같은 시간") ? "같은 시간에 다른 강습이 있어 수락할 수 없습니다." : "이미 끝났거나 응답할 수 없는 의뢰입니다." };
  }
  // 카드가 목록에서 빠지므로 결과는 페이지 안내로 (먼 날짜 강습은 홈에 안 보인다)
  if (formData.get("decision") === "accept") redirect(withNotice("/instructor", "accepted"));
  return {};
}

// 완료 보고와 강습 노트
export async function completeLesson(_prev: { ok?: boolean; message?: string } | undefined, formData: FormData) {
  await requireArea("instructor");
  notifyAfterResponse(); // 이 작업이 쌓는 알림을 응답 뒤에 보낸다
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_lesson", {
    p_job_id: String(formData.get("job_id") ?? ""),
    p_note: String(formData.get("note") ?? "").slice(0, 1000),
  });
  revalidatePath("/instructor");
  if (error) return { message: "보고하지 못했습니다. 새로고침 후 다시 시도해 주세요." };
  redirect(withNotice("/instructor", "reported"));
}

// 강사 일방 취소 (패널티). 강습은 샵으로 돌아간다.
export async function cancelMyLesson(_prev: { ok?: boolean; message?: string } | undefined, formData: FormData) {
  await requireArea("instructor");
  notifyAfterResponse(); // 이 작업이 쌓는 알림을 응답 뒤에 보낸다
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("instructor_cancel", {
    p_job_id: String(formData.get("job_id") ?? ""),
    p_reason: String(formData.get("reason") ?? "").slice(0, 200),
  });
  revalidatePath("/instructor");
  revalidatePath("/instructor/schedule");
  if (error) return { message: "취소하지 못했습니다. 완료 보고한 강습은 취소할 수 없습니다." };
  redirect(withNotice(String(formData.get("back") ?? ""), data === 3 ? "canceled-3" : "canceled-1"));
}
