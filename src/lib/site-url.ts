// 서비스 주소 (P24-1). 운영 Vercel 환경변수 SITE_URL(서버 전용, 예: https://winter-partner.co.kr)이 있으면 그 주소,
// 없으면 요청 주소를 쓴다. 도메인 전환은 SITE_URL을 넣는 것으로 끝나게 한다(docs/domain-cutover.md).

// 주소에서 origin(https://호스트[:포트])만 남긴다. http·https가 아니거나 잘못된 값은 null.
export function normalizeSiteUrl(raw: string | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}

export function configuredSiteUrl(env: Record<string, string | undefined> = process.env): string | null {
  return normalizeSiteUrl(env.SITE_URL);
}

// 프록시(Vercel) 헤더 → host 순으로 요청 주소를 만든다
export function originFromHeaders(h: Headers): string {
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

// 전환 전 운영 주소. 전환 뒤에도 Vercel이 계속 살려 두는 주소다.
export const LEGACY_SITE_URL = "https://winter-partner.vercel.app";

// 웹푸시 VAPID 연락처(mailto: 또는 https:). 운영은 VAPID_SUBJECT를 넣어 둔다.
export function vapidSubject(env: Record<string, string | undefined> = process.env): string {
  return env.VAPID_SUBJECT || configuredSiteUrl(env) || LEGACY_SITE_URL;
}
