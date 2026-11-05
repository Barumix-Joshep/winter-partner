"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { INBOX_POLL_MS } from "@/lib/channels/inbox";
import { inboxPulse } from "./actions";

// 인박스 실시간 갱신(P22-5). 로그인 쿠키가 HttpOnly라 브라우저에 Supabase 토큰이 없어 Supabase Realtime을 브라우저에서 구독하지 않는다.
// 대신 화면이 보이는 동안 10초마다 서버 액션(inboxPulse: 대기 수·마지막 메시지 시각)을 묻고, 값이 바뀌었을 때만 router.refresh()로
// 서버 컴포넌트를 다시 그린다(입력 중인 답장 글은 그대로 남는다). 화면이 숨으면 멈추고, 다시 보이면 바로 한 번 묻는다.
// 자동 로그아웃(P21-1)은 사용자 조작만 세므로 이 확인은 로그인 시간을 늘리지 않는다.
export function LiveRefresh() {
  const router = useRouter();
  const last = useRef<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const v = await inboxPulse();
        if (v !== null && last.current !== null && v !== last.current) router.refresh();
        if (v !== null) last.current = v;
      } catch {
        // 네트워크가 잠깐 끊겨도 다음 차례에 다시 묻는다
      } finally {
        busy = false;
      }
    };
    const start = () => {
      if (timer) return;
      timer = setInterval(check, INBOX_POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void check();
        start();
      } else stop();
    };
    void check();
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  return null;
}
