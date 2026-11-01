import "server-only";
import { headers } from "next/headers";

// 공유 링크(동의·셀프 등록)에 넣을 이 사이트 주소. 배포 주소가 바뀌어도 요청 주소를 따른다.
export async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
