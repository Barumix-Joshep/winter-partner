"use client";

import { useEffect } from "react";
import { signOutIdle } from "@/app/login/actions";
import { IDLE_KEY, IDLE_LIMIT_MS, isIdle, parseLastActive } from "@/lib/auth/idle";
import type { Area } from "@/lib/auth/routing";

const WRITE_EVERY_MS = 15 * 1000; // 마우스 움직임마다 쓰지 않게
const CHECK_EVERY_MS = 60 * 1000;
const EVENTS = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"] as const;

// 조작이 기준 시간보다 오래 없으면 이 기기 세션만 끊고(scope local) 로그인 화면으로 보낸다.
// 화면을 닫아 뒀다가 다시 열 때도(잠자기·탭 닫기) 처음 그릴 때 마지막 조작 시각을 보고 끊는다.
export function IdleLogout({ area, sessionId }: { area: Area; sessionId: string }) {
  useEffect(() => {
    const limit = IDLE_LIMIT_MS[area];
    let done = false;
    let lastWrite = 0;
    const read = () => {
      try {
        return parseLastActive(localStorage.getItem(IDLE_KEY));
      } catch {
        return null;
      }
    };
    const write = (at: number) => {
      lastWrite = at;
      try {
        localStorage.setItem(IDLE_KEY, JSON.stringify({ at, sid: sessionId }));
      } catch {
        // 저장소를 못 쓰면(사생활 보호 모드 등) 이 탭 안에서만 센다
      }
    };
    const logout = async () => {
      done = true;
      try {
        localStorage.removeItem(IDLE_KEY);
      } catch {}
      await signOutIdle().catch(() => {});
      window.location.replace("/login?reason=idle");
    };
    const check = () => {
      if (done) return true;
      const last = read() ?? (lastWrite ? { at: lastWrite, sid: sessionId } : null);
      if (isIdle(last, sessionId, Date.now(), limit)) {
        void logout();
        return true;
      }
      return false;
    };
    const onActivity = () => {
      const now = Date.now();
      if (now - lastWrite < WRITE_EVERY_MS || check()) return;
      write(now);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };

    if (!check()) write(Date.now());
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [area, sessionId]);
  return null;
}
