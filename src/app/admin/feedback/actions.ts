"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireArea } from "@/lib/auth/session";

const STATUSES = ["new", "in_progress", "done"];

export async function updateFeedback(formData: FormData) {
  await requireArea("admin");
  const status = String(formData.get("status") ?? "");
  if (!STATUSES.includes(status)) return;
  const supabase = await createClient();
  await supabase.rpc("set_feedback_status", { p_id: Number(formData.get("id")), p_status: status, p_note: String(formData.get("note") ?? "") });
  revalidatePath("/admin/feedback");
}
