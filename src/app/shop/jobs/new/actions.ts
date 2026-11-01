"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireArea } from "@/lib/auth/session";
import { getMyShop } from "@/lib/shop/my-shop";
import { parseJob } from "@/lib/shop/job";

export type JobFormState = { message?: string; errors?: Record<string, string | undefined> };

export async function createJob(_prev: JobFormState | undefined, formData: FormData): Promise<JobFormState> {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/shop/new");

  const parsed = parseJob(formData, shop.resorts.map((r) => r.id));
  if (!parsed.ok) return { errors: parsed.errors };
  const j = parsed.data;

  const supabase = await createClient();
  // 강습·손님 강습료·손님을 한 트랜잭션으로 (supabase/migrations/*_create_job.sql)
  const { error } = await supabase.rpc("create_job", {
    p_shop_id: shop.id,
    p_resort_id: j.resortId,
    p_sport_id: j.sportId,
    p_starts: j.startsAt,
    p_ends: j.endsAt,
    p_lesson_type: j.lessonType,
    p_student_count: j.studentCount,
    p_customer_price: j.customerPrice,
    p_instructor_rate: j.instructorRate,
    p_patch_paid_by: j.patchPaidBy,
    p_note: j.note,
    p_customer_id: j.customerId,
    p_new_customer: j.newCustomer,
  });
  if (error) return { message: "저장하지 못했습니다. 입력을 확인하고 다시 시도해 주세요." };
  redirect("/shop/jobs");
}
