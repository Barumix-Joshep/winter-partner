"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseOnboarding } from "@/lib/auth/validate";
import type { FormState } from "@/app/login/actions";

// 역할이 없는 사용자(OAuth 첫 로그인)가 역할을 고른다. RLS가 본인 행·허용 역할만 받는다.
export async function chooseRole(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const parsed = parseOnboarding(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) redirect("/login");

  const { error } = await supabase.from("profiles").insert({ id: uid, role: parsed.data.role, name: parsed.data.name });
  if (error) return { message: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  if (parsed.data.role === "instructor") {
    const { error: e2 } = await supabase.from("instructors").insert({ user_id: uid });
    if (e2) return { message: "강사 프로필을 만들지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
  redirect("/");
}
