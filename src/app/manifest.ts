import type { MetadataRoute } from "next";

// PWA: 홈 화면에 추가하면 앱처럼 연다 (아이콘은 scripts/make-icons.mjs로 만든다)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "겨울파트너",
    short_name: "겨울파트너",
    description: "렌탈샵·강습팀과 스키·스노우보드·스노우스케이트 강사를 잇는 파트너 플랫폼",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "ko",
    background_color: "#F4F6FA",
    theme_color: "#0F1E3D",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
