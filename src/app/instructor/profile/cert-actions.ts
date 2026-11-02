"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { isAiEnabled } from "@/lib/ai/flags";
import { readCertificate } from "@/lib/ai/cert-read";
import { createClient } from "@/lib/supabase/server";
import { requireArea } from "@/lib/auth/session";
import { certPath, parseCert } from "@/lib/instructor/cert";

export type CertFormState = { ok?: boolean; message?: string; errors?: Record<string, string | undefined> };

async function myInstructorId(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("instructors").select("id").eq("user_id", userId).maybeSingle();
  return { supabase, instructorId: data?.id as string | undefined };
}

export async function uploadCert(_prev: CertFormState | undefined, formData: FormData): Promise<CertFormState> {
  const user = await requireArea("instructor");
  const parsed = parseCert(formData);
  if (!parsed.ok) return { errors: parsed.errors };

  const { supabase, instructorId } = await myInstructorId(user.id);
  if (!instructorId) return { message: "강사 프로필을 찾을 수 없습니다." };

  // 경로는 서버가 정한다 (스토리지 RLS도 자기 폴더만 허용)
  const path = certPath(instructorId, parsed.data.ext);
  const { error: upErr } = await supabase.storage
    .from("certs")
    .upload(path, parsed.data.file, { contentType: parsed.data.file.type });
  if (upErr) return { message: "파일을 올리지 못했습니다. 잠시 후 다시 시도해 주세요." };

  const { data: row, error } = await supabase
    .from("instructor_certs")
    .insert({ instructor_id: instructorId, issuer: parsed.data.issuer, grade: parsed.data.grade, file_url: path })
    .select("id")
    .single();
  if (error || !row) {
    await supabase.storage.from("certs").remove([path]);
    return { message: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
  // AI 판독(켜져 있을 때): 응답 뒤에 읽어 본사 검증 화면에 참고값으로 보여 준다
  if (await isAiEnabled(null, "cert")) {
    const bytes = await parsed.data.file.arrayBuffer();
    const mime = parsed.data.file.type;
    after(() => readCertificate(row.id, user.id, bytes, mime).catch((e) => console.error("cert read failed", e instanceof Error ? e.name : e)));
  }
  revalidatePath("/instructor/profile");
  return { ok: true, message: "올렸습니다. 본사 확인 뒤 프로필에 표시됩니다." };
}

export async function deleteCert(formData: FormData) {
  await requireArea("instructor");
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  // RLS가 본인 자격증만 지우게 한다
  const { data } = await supabase.from("instructor_certs").delete().eq("id", id).select("file_url").maybeSingle();
  if (data?.file_url) await supabase.storage.from("certs").remove([data.file_url]);
  revalidatePath("/instructor/profile");
}
