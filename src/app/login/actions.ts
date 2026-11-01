"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authErrorMessage, parseLogin, parseSignup, safeNext } from "@/lib/auth/validate";

export type FormState = {
  message?: string;
  sent?: boolean; // 가입 인증 메일 발송됨
  errors?: Record<string, string | undefined>;
};

export async function signIn(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const parsed = parseLogin(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { message: authErrorMessage(error.message) };

  redirect(safeNext(formData.get("next") as string | null));
}

export async function signUp(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const parsed = parseSignup(formData);
  if (!parsed.ok) return { errors: parsed.errors };
  const { name, email, password, role } = parsed.data;

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  // 프로필은 DB 트리거(handle_new_user)가 메타데이터로 만든다
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, role }, emailRedirectTo: `${origin}/auth/confirm` },
  });
  if (error) return { message: authErrorMessage(error.message) };

  // 이메일 인증을 끈 환경(로컬)에서는 바로 세션이 생긴다
  if (data.session) redirect("/");
  return { sent: true, message: `${email}로 인증 메일을 보냈습니다. 메일의 링크를 누르면 가입이 끝납니다.` };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
