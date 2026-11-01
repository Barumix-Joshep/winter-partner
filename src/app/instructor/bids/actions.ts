"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireArea } from "@/lib/auth/session";
import { parseBidAmount } from "@/lib/shop/bid";

export type BidState = { ok?: boolean; message?: string };

// 금액 제시. place_bid가 전속·마감·상한·시간 겹침을 다시 확인한다.
export async function placeBid(_prev: BidState | undefined, formData: FormData): Promise<BidState> {
  await requireArea("instructor");
  const jobId = String(formData.get("job_id") ?? "");
  const amount = parseBidAmount(String(formData.get("amount") ?? ""), Number(formData.get("ceiling") ?? 0));
  if (!amount.ok) return { message: amount.message };
  const supabase = await createClient();
  const { error } = await supabase.rpc("place_bid", {
    p_job_id: jobId,
    p_amount: amount.amount,
    p_memo: String(formData.get("memo") ?? ""),
  });
  revalidatePath("/instructor/bids");
  if (error) {
    if (error.message.includes("같은 시간")) return { message: "같은 시간에 확정된 강습이 있어 입찰할 수 없습니다." };
    if (error.message.includes("마감")) return { message: "마감된 공고입니다." };
    return { message: "입찰하지 못했습니다. 금액을 확인해 주세요." };
  }
  return { ok: true, message: "제시했습니다." };
}

export async function withdrawBid(formData: FormData) {
  await requireArea("instructor");
  const supabase = await createClient();
  await supabase.rpc("withdraw_bid", { p_job_id: String(formData.get("job_id") ?? "") });
  revalidatePath("/instructor/bids");
}
