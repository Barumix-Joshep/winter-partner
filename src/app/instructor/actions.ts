"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { notifyAfterResponse } from "@/lib/notify/dispatch";
import { requireArea } from "@/lib/auth/session";
import { withNotice } from "@/lib/instructor/notice";
import { detectHealthTerms } from "@/lib/privacy/health";
import { aiHealthCategories } from "@/lib/ai/health-check";
import { callStructured } from "@/lib/ai/client";
import { isAiEnabled } from "@/lib/ai/flags";
import { formatTidy, parseTidy, TIDY_SCHEMA, TIDY_SYSTEM, TIDY_TOOL } from "@/lib/ai/note";
import { redact } from "@/lib/ai/redact";

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
  const note = String(formData.get("note") ?? "");
  const jobId = String(formData.get("job_id") ?? "");
  let health = detectHealthTerms(note);
  if (!health.length) {
    const { data: job } = await supabase.from("jobs").select("shop_id").eq("id", jobId).maybeSingle();
    const user = await requireArea("instructor");
    health = await aiHealthCategories(note, health, { shopId: (job?.shop_id as string) ?? null, userId: user.id });
  }
  if (health.length) {
    await supabase.rpc("record_health_warning", { p_field: "lesson_note", p_customer_id: null, p_job_id: jobId, p_terms: health });
    redirect(withNotice("/instructor", "reported-health"));
  }
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

export type TidyState = { text?: string; health?: string[]; message?: string };

// B1 수업 메모 정리: 진도·잘된 점·다음 과제로 정리한 초안을 돌려준다(저장은 강사가 고친 뒤 완료 보고로)
export async function tidyNote(jobId: string, raw: string): Promise<TidyState> {
  const user = await requireArea("instructor");
  const text = raw.slice(0, 1000).trim();
  if (text.length < 5) return { message: "메모를 조금 더 적어 주세요." };
  const supabase = await createClient();
  const { data: job } = await supabase.from("jobs").select("shop_id").eq("id", jobId).maybeSingle();
  const shopId = (job?.shop_id as string) ?? null;
  if (!shopId || !(await isAiEnabled(shopId, "note_tidy"))) return { message: "지금은 정리 기능을 쓸 수 없습니다." };
  const r = await callStructured({
    feature: "note_tidy",
    shopId,
    userId: user.id,
    system: TIDY_SYSTEM,
    content: redact(text, [], { maskHealth: false }).text,
    toolName: TIDY_TOOL,
    schema: TIDY_SCHEMA,
    parse: parseTidy,
    maxTokens: 500,
  });
  if (!r) return { message: "정리하지 못했습니다. 그대로 보고해도 됩니다." };
  return { text: formatTidy(r), health: r.healthSentences };
}
