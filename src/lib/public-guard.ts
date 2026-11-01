import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";

// 로그인 없는 공개 페이지의 요청 제한 키: 접속 IP를 해시해서 쓴다 (원문 IP는 저장하지 않는다)
export async function clientKey() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`winter-partner:${ip}`).digest("hex").slice(0, 32);
}
