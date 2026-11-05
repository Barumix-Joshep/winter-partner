// 테스트용 인스타 웹훅 본문 (단위·E2E 공용). 메타 문서 형식을 따른 가짜 값이다.
import { createHmac } from "node:crypto";

export const IG_ACCOUNT = "17841400000000099"; // 샵 인스타 계정 id (가짜)
export const IG_CUSTOMER = "1234567890123456"; // 손님 id (가짜)

type Msg = Record<string, unknown>;

export function igMessaging(message: Msg | null, over: { sender?: string; recipient?: string; timestamp?: number; extra?: Msg } = {}) {
  return {
    sender: { id: over.sender ?? IG_CUSTOMER },
    recipient: { id: over.recipient ?? IG_ACCOUNT },
    timestamp: over.timestamp ?? Date.UTC(2026, 11, 20, 1, 0, 0),
    ...(message ? { message } : {}),
    ...(over.extra ?? {}),
  };
}

export function igPayload(...messaging: ReturnType<typeof igMessaging>[]) {
  return { object: "instagram", entry: [{ id: IG_ACCOUNT, time: Date.UTC(2026, 11, 20, 1, 0, 0), messaging }] };
}

export const igText = (text: string, mid = "aWdfZAG1faXRlbTox-mid-0001") => ({ mid, text });

export function igSign(raw: string | Uint8Array, secret: string) {
  return "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
}
