"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authErrorMessage, parseLogin, parseResetRequest, parseSignup, safeNext } from "@/lib/auth/validate";
import { clientIp, countFailure, overLimit } from "@/lib/ops/rate-limit";
import { limitMessage } from "@/lib/ops/limits";

export type FormState = {
  message?: string;
  sent?: boolean; // 가입 인증 메일 발송됨
  errors?: Record<string, string | undefined>;
};

export async function signIn(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const parsed = parseLogin(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  // 실패만 센다: 같은 계정 10번, 같은 IP 30번(10분)
  const ip = await clientIp();
  const checks: Parameters<typeof overLimit>[0] = [["login_account", parsed.data.email], ["login_ip", ip]];
  const limited = await overLimit(checks);
  if (limited) return { message: limitMessage(limited) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.message === "Invalid login credentials") await countFailure(checks);
    return { message: authErrorMessage(error.message) };
  }

  redirect(safeNext(formData.get("next") as string | null));
}

export async function signUp(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const parsed = parseSignup(formData);
  if (!parsed.ok) return { errors: parsed.errors };
  const { name, email, password, role } = parsed.data;
  const limited = await overLimit([["signup_ip", await clientIp()]]);
  if (limited) return { message: limitMessage(limited) };

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  // 프로필은 DB 트리거(handle_new_user)가 메타데이터로 만든다
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, role, agreed: true }, emailRedirectTo: `${origin}/auth/confirm` },
  });
  if (error) return { message: authErrorMessage(error.message) };

  // 이메일 인증을 끈 환경(로컬)에서는 바로 세션이 생긴다
  if (data.session) redirect("/");
  return { sent: true, message: `${email}로 인증 메일을 보냈습니다. 메일의 링크를 누르면 가입이 끝납니다.` };
}

// 비밀번호 재설정 메일. 가입 여부를 알려 주지 않도록 결과와 상관없이 같은 안내를 보여 준다.
export async function requestPasswordReset(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const parsed = parseResetRequest(formData);
  if (!parsed.ok) return { errors: parsed.errors };
  const { email } = parsed.data;
  const limited = await overLimit([["reset_account", email], ["reset_ip", await clientIp()]]);
  if (limited) return { message: limitMessage(limited) };

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/confirm?next=/login/reset` });
  if (error) console.error("reset email failed", error.status ?? "-", error.code ?? error.name);
  return { sent: true, message: `${email}로 가입돼 있다면 비밀번호 재설정 메일을 보냈습니다. 메일의 링크를 눌러 새 비밀번호를 정해 주세요.` };
}

// 재설정 링크로 들어온 뒤(세션 있음) 새 비밀번호 저장
export async function updatePassword(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { errors: { password: "비밀번호는 8자 이상이어야 합니다." } };
  if (password !== String(formData.get("confirm") ?? "")) return { errors: { confirm: "두 비밀번호가 다릅니다." } };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { message: "재설정 링크가 만료됐습니다. 다시 요청해 주세요." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { message: error.code === "same_password" ? "지금 비밀번호와 다른 비밀번호를 정해 주세요." : "잠시 후 다시 시도해 주세요." };
  }
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// 약관·개인정보 처리방침 동의 (가입 때 동의하지 않은 기존 회원)
export async function recordAgreement() {
  const supabase = await createClient();
  await supabase.rpc("record_terms_agreement");
  redirect("/");
}
