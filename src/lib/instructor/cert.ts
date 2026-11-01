// 자격증 업로드 검증. 버킷 설정(supabase/migrations/*_certs.sql)과 같은 제한을 둔다.
import { text } from "@/lib/form";

export const CERT_MAX_BYTES = 4 * 1024 * 1024; // Vercel 요청 본문 한도(4.5MB) 아래
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export type CertInput = { issuer: string; grade: string | null; file: File; ext: string };

type Result = { ok: true; data: CertInput } | { ok: false; errors: Partial<Record<"issuer" | "file", string>> };

export function parseCert(fd: FormData): Result {
  const issuer = text(fd, "issuer");
  const grade = text(fd, "grade") || null;
  const file = fd.get("file");
  const errors: Partial<Record<"issuer" | "file", string>> = {};

  if (!issuer) errors.issuer = "발급처를 입력해 주세요 (예: KSIA).";
  let ext = "";
  if (!(file instanceof File) || file.size === 0) errors.file = "자격증 사진이나 PDF를 올려 주세요.";
  else if (!MIME_EXT[file.type]) errors.file = "JPG·PNG·WEBP 사진이나 PDF만 올릴 수 있습니다.";
  else if (file.size > CERT_MAX_BYTES) errors.file = "파일은 4MB까지 올릴 수 있습니다.";
  else ext = MIME_EXT[file.type];

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data: { issuer, grade, file: file as File, ext } };
}

export function certPath(instructorId: string, ext: string) {
  return `${instructorId}/${crypto.randomUUID()}.${ext}`;
}
