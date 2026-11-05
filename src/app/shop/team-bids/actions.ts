"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notifyAfterResponse } from "@/lib/notify/dispatch";
import { requireArea } from "@/lib/auth/session";
import { parseBidAmount } from "@/lib/shop/bid";

export type TeamState = { ok?: boolean; message?: string };

// 팀 입찰. place_team_bid가 강습팀 여부·팀 입찰 허용·마감·상한을 다시 확인한다.
export async function placeTeamBid(_prev: TeamState | undefined, formData: FormData): Promise<TeamState> {
  await requireArea("shop");
  notifyAfterResponse();
  const amount = parseBidAmount(String(formData.get("amount") ?? ""), Number(formData.get("ceiling") ?? 0));
  if (!amount.ok) return { message: amount.message };
  const supabase = await createClient();
  const { error } = await supabase.rpc("place_team_bid", {
    p_job_id: String(formData.get("job_id") ?? ""),
    p_amount: amount.amount,
    p_memo: String(formData.get("memo") ?? "").slice(0, 100),
  });
  revalidatePath("/shop/team-bids");
  if (error) {
    if (error.message.includes("마감")) return { message: "마감된 공고입니다." };
    if (error.message.includes("요청이 너무 많습니다")) return { message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." };
    return { message: "입찰하지 못했습니다. 금액을 확인해 주세요." };
  }
  return { ok: true, message: "제시했습니다." };
}

export async function withdrawTeamBid(formData: FormData) {
  await requireArea("shop");
  const supabase = await createClient();
  await supabase.rpc("withdraw_team_bid", { p_job_id: String(formData.get("job_id") ?? "") });
  revalidatePath("/shop/team-bids");
}

// 팀장이 맡은 강습에 팀원을 지정한다
export async function assignMember(_prev: TeamState | undefined, formData: FormData): Promise<TeamState> {
  await requireArea("shop");
  notifyAfterResponse();
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_team_instructor", {
    p_job_id: String(formData.get("job_id") ?? ""),
    p_instructor_id: String(formData.get("instructor_id") ?? ""),
  });
  revalidatePath("/shop/team-bids");
  if (error) return { message: error.message.includes("같은 시간") ? "이 팀원은 같은 시간에 다른 강습이 있습니다." : "지정하지 못했습니다. 새로고침 후 다시 시도해 주세요." };
  return { ok: true, message: "지정했습니다. 팀원에게 알림이 갑니다." };
}
