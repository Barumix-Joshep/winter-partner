"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireArea } from "@/lib/auth/session";
import { rangesFromCells, weekStartOf, weekWindow } from "@/lib/instructor/schedule";

export type ScheduleState = { ok?: boolean; message?: string };

export async function saveWeek(_prev: ScheduleState | undefined, formData: FormData): Promise<ScheduleState> {
  await requireArea("instructor");
  const week = String(formData.get("week") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || weekStartOf(week) !== week) return { message: "주를 다시 골라 주세요." };
  const win = weekWindow(week);
  // 칸 → 합친 범위. 이 주 밖의 칸은 DB가 거부한다.
  const ranges = rangesFromCells(formData.getAll("cells").map(String)).filter((r) => r.starts >= win.from.slice(0, 10));
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_week_availability", { p_from: win.from, p_to: win.to, p_ranges: ranges });
  revalidatePath("/instructor/schedule");
  return error ? { message: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요." } : { ok: true, message: "저장했습니다." };
}
