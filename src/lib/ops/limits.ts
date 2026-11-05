import { createHash } from "node:crypto";

// 요청 횟수 제한 값 (P16-3). 근거는 docs/rate-limits.md. 바꾸면 문서도 같이 고친다.
// count: "all" = 시도마다 센다, "fail" = 실패만 센다(정상 로그인은 막지 않는다)
export const LIMITS = {
  login_ip: { max: 30, windowSeconds: 600, count: "fail" },
  login_account: { max: 10, windowSeconds: 600, count: "fail" },
  signup_ip: { max: 10, windowSeconds: 3600, count: "all" },
  reset_ip: { max: 10, windowSeconds: 3600, count: "all" },
  reset_account: { max: 3, windowSeconds: 3600, count: "all" },
  link_view_ip: { max: 60, windowSeconds: 600, count: "all" },
  ai_user: { max: 30, windowSeconds: 600, count: "all" },
  feedback_ip: { max: 10, windowSeconds: 3600, count: "all" },
  // AI 상담 웹훅 (P22-3). 손님은 로그인하지 않으므로 대화·샵 단위로 센다
  consult_conversation: { max: 20, windowSeconds: 600, count: "all" },
  consult_shop: { max: 300, windowSeconds: 600, count: "all" },
} as const satisfies Record<string, { max: number; windowSeconds: number; count: "all" | "fail" }>;

export type LimitName = keyof typeof LIMITS;

// 키에는 IP·이메일 원문을 넣지 않는다 (해시 앞 32자)
export function limitKey(name: LimitName, subject: string) {
  const h = createHash("sha256").update(`winter-partner:${subject.trim().toLowerCase()}`).digest("hex").slice(0, 32);
  return `${name}:${h}`;
}

export function limitMessage(name: LimitName) {
  const minutes = Math.round(LIMITS[name].windowSeconds / 60);
  const wait = minutes >= 60 ? `${Math.round(minutes / 60)}시간` : `${minutes}분`;
  return `요청이 너무 많습니다. ${wait} 뒤에 다시 시도해 주세요.`;
}
