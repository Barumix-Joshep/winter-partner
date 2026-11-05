import type { NextConfig } from "next";

// 보안 헤더 (P19-3). CSP는 nonce 없이(부분 사전 렌더링과 함께 쓰려고) 'unsafe-inline'을 허용한다.
// 외부로 나가는 곳은 Supabase(API·실시간)뿐이다. 먼저 Report-Only로 내보내 깨지는 곳을 보고, 문제가 없으면 CSP_ENFORCE를 true로 바꾼다.
const CSP_ENFORCE = false;
const isDev = process.env.NODE_ENV === "development";
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseWs = supabase.replace(/^http/, "ws");
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: ${supabase}`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabase} ${supabaseWs}${isDev ? " ws: http://127.0.0.1:* http://localhost:*" : ""}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  `form-action 'self' ${supabase}`,
  "frame-ancestors 'none'",
  // Report-Only에서는 브라우저가 이 지시어를 무시하고 경고만 남기므로 강제할 때만 넣는다
  ...(isDev || !CSP_ENFORCE ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: CSP_ENFORCE ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", value: csp },
  // 관리 화면 클릭재킹 방지 (frame-ancestors를 모르는 옛 브라우저용)
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 마이크는 완료 보고 "말로 입력" 때문에 이 사이트만 허용
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), usb=(), microphone=(self)" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  partialPrefetching: true,
  // 정산서 PDF가 읽는 한글 글꼴 (src/lib/settlement/pdf.ts)
  outputFileTracingIncludes: {
    "/settlements/**": ["./src/assets/fonts/**"],
  },
  experimental: {
    // 자격증 파일 업로드 (src/lib/instructor/cert.ts의 4MB 제한 + 폼 여유)
    serverActions: { bodySizeLimit: "5mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
