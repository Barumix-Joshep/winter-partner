"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { parseFeedback } from "@/lib/feedback/parse";
import { clientIp, overLimit } from "@/lib/ops/rate-limit";
import { limitMessage } from "@/lib/ops/limits";

export type FeedbackState = { done?: boolean; masked?: boolean; message?: string };

// 의견 보내기 (P16-6). 로그인 없이도 보낼 수 있고, 로그인했으면 누가 보냈는지 함께 남긴다.
export async function sendFeedback(_prev: FeedbackState | undefined, formData: FormData): Promise<FeedbackState> {
  const parsed = parseFeedback(formData);
  if (!parsed.ok) return { message: parsed.error };
  const limited = await overLimit([["feedback_ip", await clientIp()]]);
  if (limited) return { message: limitMessage(limited) };
  const { data: claims } = await (await createClient()).auth.getClaims();
  const { error } = await createAdminClient().rpc("submit_feedback", {
    p_user_id: (claims?.claims.sub as string | undefined) ?? null,
    p_page_path: parsed.data.path,
    p_body: parsed.data.body,
    p_contact: parsed.data.contact,
  });
  if (error) return { message: "보내지 못했습니다. 잠시 후 다시 시도해 주세요." };
  return { done: true, masked: parsed.data.masked };
}
