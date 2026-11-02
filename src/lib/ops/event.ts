import { redact } from "@/lib/ai/redact";

// 운영 기록에 남길 오류 설명: 이름·메시지(연락처·이메일 제거)·digest, 300자까지
export function errorDetail(err: unknown): string {
  let text: string;
  if (err instanceof Error) {
    const digest = "digest" in err && err.digest ? ` (digest ${String(err.digest)})` : "";
    text = `${err.name}: ${err.message}${digest}`;
  } else {
    text = String(err);
  }
  return redact(text, [], { maskHealth: false }).text.slice(0, 300);
}
