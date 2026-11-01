"use server";

import { createClient } from "@/lib/supabase/server";
import { requireArea } from "@/lib/auth/session";
import { parseInstructorProfile } from "@/lib/instructor/validate";

export type ProfileFormState = { saved?: boolean; message?: string; errors?: Record<string, string | undefined> };

export async function saveProfile(_prev: ProfileFormState | undefined, formData: FormData): Promise<ProfileFormState> {
  await requireArea("instructor");
  const parsed = parseInstructorProfile(formData);
  if (!parsed.ok) return { errors: parsed.errors };
  const { level, bio, baseRate, sportIds, resortIds } = parsed.data;

  const supabase = await createClient();
  // 기본 정보·종목·스키장을 한 트랜잭션으로 (supabase/migrations/*_instructor_profile.sql)
  const { error } = await supabase.rpc("save_instructor_profile", {
    p_level: level,
    p_bio: bio,
    p_base_rate: baseRate,
    p_sport_ids: sportIds,
    p_resort_ids: resortIds,
  });
  if (error) return { message: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  return { saved: true, message: "저장했습니다." };
}
