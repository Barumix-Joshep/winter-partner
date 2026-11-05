"use client";

import { errorCode } from "@/components/error-screen";

// 루트 레이아웃까지 실패했을 때. 전역 스타일이 없어서 인라인 스타일로 그린다.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const code = errorCode(error);
  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#F4F6FA", color: "#0F1E3D" }}>
        <title>겨울파트너 · 오류</title>
        <div role="alert" style={{ maxWidth: 420, margin: "80px auto", padding: 24, background: "#fff", borderRadius: 14, textAlign: "center" }}>
          <p style={{ fontSize: 18, fontWeight: 700 }}>잠깐 문제가 생겼습니다</p>
          <p style={{ fontSize: 14 }}>잠시 후 다시 시도해 주세요. 계속 안 되면 오류 번호와 함께 본사에 알려 주세요.</p>
          <p style={{ fontSize: 12, color: "#5B6B8A" }}>오류 번호: {code ?? "번호 없음"}</p>
          <button onClick={() => retry()} style={{ minHeight: 44, padding: "0 20px", border: 0, borderRadius: 10, background: "#1E4FD8", color: "#fff" }}>
            다시 시도
          </button>{" "}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- 루트 레이아웃이 깨진 상태라 전체 새로 불러오기 */}
          <a href="/" style={{ display: "inline-block", minHeight: 44, lineHeight: "44px", padding: "0 20px", color: "#0F1E3D" }}>
            홈으로
          </a>
        </div>
      </body>
    </html>
  );
}
