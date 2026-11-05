// 앱 쪽 유휴 자동 로그아웃 기준 (보안 1 세션 관리). 서버 쪽 Time-box·비활성 타임아웃은 Supabase Pro 기능이라 아직 없다.
// 관리 화면일수록 짧게: 본사 30분, 샵 2시간(카운터에 화면을 켜 두는 시간을 고려), 강사 7일(휴대폰 PWA).
import type { Area } from "./routing";

const MIN = 60 * 1000;
export const IDLE_LIMIT_MS: Record<Area, number> = { admin: 30 * MIN, shop: 120 * MIN, instructor: 7 * 24 * 60 * MIN };

// 마지막 조작 시각을 탭끼리 공유하는 localStorage 키. 값은 {at, sid} — 세션이 바뀌면(새로 로그인) 지난 기록은 무시한다.
export const IDLE_KEY = "wp:last-active";

export type LastActive = { at: number; sid: string };

export function parseLastActive(raw: string | null): LastActive | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<LastActive>;
    return typeof v.at === "number" && typeof v.sid === "string" ? { at: v.at, sid: v.sid } : null;
  } catch {
    return null;
  }
}

// 같은 세션의 마지막 조작이 기준보다 오래됐으면 true. 기록이 없거나 다른 세션 것이면 false(지금부터 센다).
export function isIdle(last: LastActive | null, sid: string, now: number, limitMs: number) {
  return !!last && last.sid === sid && now - last.at > limitMs;
}
