import "server-only";
import { createClient } from "@/lib/supabase/server";

export type MyInstructorProfile = {
  level: string | null;
  bio: string | null;
  baseRate: number | null;
  certStatus: "pending" | "approved" | "rejected";
  sportIds: number[];
  resortIds: number[];
};

// 로그인한 강사 본인의 프로필 (RLS: 본인 행)
export async function getMyInstructorProfile(userId: string): Promise<MyInstructorProfile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("instructors")
    .select("level, bio, base_rate, cert_status, instructor_sports(sport_id), instructor_resorts(resort_id)")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    level: data.level,
    bio: data.bio,
    baseRate: data.base_rate,
    certStatus: data.cert_status,
    sportIds: (data.instructor_sports as { sport_id: number }[]).map((s) => s.sport_id),
    resortIds: (data.instructor_resorts as { resort_id: number }[]).map((r) => r.resort_id),
  };
}

export async function getReferenceData() {
  const supabase = await createClient();
  const [{ data: sports }, { data: resorts }] = await Promise.all([
    supabase.from("sports").select("id, name").order("id"),
    supabase.from("resorts").select("id, name, region").eq("active", true).order("id"),
  ]);
  return { sports: (sports ?? []) as { id: number; name: string }[], resorts: (resorts ?? []) as { id: number; name: string; region: string }[] };
}
