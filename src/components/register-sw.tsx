"use client";

import { useEffect } from "react";

// 서비스 워커 등록 (오프라인 셸·웹푸시). 개발 서버에서는 캐시가 헷갈리지 않게 등록하지 않는다.
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
