import "server-only";
import { headers } from "next/headers";
import { configuredSiteUrl, originFromHeaders } from "@/lib/site-url";

// 공유 링크(동의·셀프 등록·가입 안내)에 넣을 이 사이트 주소. SITE_URL이 있으면 그 주소, 없으면 요청 주소(P24-1).
// headers()를 먼저 불러 요청 시점에 환경변수를 읽는다(동적 렌더링).
export async function siteOrigin() {
  const h = await headers();
  return configuredSiteUrl() ?? originFromHeaders(h);
}

// 지금 요청이 들어온 주소. 쿠키(로그인 세션·nonce)와 묶인 흐름(인스타 OAuth)은 SITE_URL과 달라도 이 주소로 돌아와야 한다.
export async function requestOrigin() {
  return originFromHeaders(await headers());
}
