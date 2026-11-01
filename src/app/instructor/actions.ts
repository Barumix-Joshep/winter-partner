"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireArea } from "@/lib/auth/session";

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
