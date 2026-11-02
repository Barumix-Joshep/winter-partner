import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { callStructured } from "./client";
import { CERT_SCHEMA, CERT_SYSTEM, CERT_TOOL, parseCertExtract, toStoredExtract } from "./cert";

type ImageType = "image/jpeg" | "image/png" | "image/webp";
const IMAGES: ImageType[] = ["image/jpeg", "image/png", "image/webp"];

// 올린 자격증 이미지를 판독해 참고값으로 저장한다 (승인은 본사). PDF는 아직 판독하지 않는다.
// 프로필 이름은 보내지 않는다: 이미지 속 성명만 읽고 비교는 서버에서 한다.
export async function readCertificate(certId: string, userId: string, bytes: ArrayBuffer, mime: string) {
  if (!IMAGES.includes(mime as ImageType)) return;
  const result = await callStructured({
    feature: "cert",
    shopId: null,
    userId,
    system: CERT_SYSTEM,
    content: [
      { type: "image", source: { type: "base64", media_type: mime as ImageType, data: Buffer.from(bytes).toString("base64") } },
      { type: "text", text: "이 자격증의 내용을 읽어 주세요." },
    ],
    toolName: CERT_TOOL,
    schema: CERT_SCHEMA,
    parse: parseCertExtract,
    maxTokens: 400,
  });
  if (!result) return;
  await createAdminClient().rpc("save_cert_extract", { p_cert_id: certId, p_extract: toStoredExtract(result) });
}
