import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
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
