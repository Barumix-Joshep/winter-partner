"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireArea } from "@/lib/auth/session";
import {
  parseAddPack,
  parseCreatePlan,
  parseExtend,
  parseGrant,
  parseSetPaid,
  parseSetQuota,
  parseSuspend,
  rpcErrorMessage,
  type Parsed,
} from "@/lib/ai/consult/license-admin";

// 본사 AI 상담 사용권 버튼 (P23-3). 본사만 들어오고(requireArea), 본사 RPC가 다시 확인하고 감사 기록을 남긴다.
export type LicenseActionState = { ok?: boolean; message: string };

const PATH = "/admin/ai/consult";

async function run<T extends Record<string, unknown>>(rpc: string, parsed: Parsed<T>, done: string): Promise<LicenseActionState> {
  await requireArea("admin");
  if (!parsed.ok) return { message: parsed.message };
  const supabase = await createClient();
  const { error } = await supabase.rpc(rpc, parsed.args);
  if (error) return { message: rpcErrorMessage(error) };
  revalidatePath(PATH);
  return { ok: true, message: done };
}

export async function grantLicense(_prev: LicenseActionState | undefined, f: FormData) {
  return run("consult_admin_grant_license", parseGrant(f), "체험을 부여했습니다.");
}

export async function setPaid(_prev: LicenseActionState | undefined, f: FormData) {
  return run("consult_admin_set_paid", parseSetPaid(f), "유료로 전환했습니다.");
}

export async function extendLicense(_prev: LicenseActionState | undefined, f: FormData) {
  return run("consult_admin_extend", parseExtend(f), "연장했습니다.");
}

export async function suspendLicense(_prev: LicenseActionState | undefined, f: FormData) {
  return run("consult_admin_suspend", parseSuspend(f), "중지했습니다.");
}

export async function addPack(_prev: LicenseActionState | undefined, f: FormData) {
  return run("consult_admin_add_pack", parseAddPack(f, Date.now()), "팩을 추가했습니다.");
}

export async function setQuota(_prev: LicenseActionState | undefined, f: FormData) {
  return run("consult_admin_set_quota", parseSetQuota(f), "포함량·하루 상한을 바꿨습니다.");
}

export async function createPlan(_prev: LicenseActionState | undefined, f: FormData) {
  return run("consult_admin_create_plan", parseCreatePlan(f), "새 요금제를 만들었습니다.");
}
