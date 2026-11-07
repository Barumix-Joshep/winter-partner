import { redact } from "@/lib/ai/redact";

// ops_events.detail 최대 길이. record_ops_event가 left(p_detail, 300)으로 자른다.
export const OPS_DETAIL_MAX = 300;

// 운영 기록에 남길 오류 설명: 이름·메시지(연락처·이메일 제거)·digest, 300자까지
export function errorDetail(err: unknown): string {
  let text: string;
  if (err instanceof Error) {
    const digest = "digest" in err && err.digest ? ` (digest ${String(err.digest)})` : "";
    text = `${err.name}: ${err.message}${digest}`;
  } else {
    text = String(err);
  }
  return redact(text, [], { maskHealth: false }).text.slice(0, OPS_DETAIL_MAX);
}

// 크론 결과(cron_run)를 운영 기록에 남길 JSON. 그대로 쓰면 300자에서 잘려 JSON이 깨진다(2026-11-07 03:00 정리 작업).
// 안쪽 객체의 0인 항목은 뺀다(없으면 0). 그래도 길면 맨 위 값만 남기고 cut: true. 전체 결과는 Vercel 로그에 그대로 있다.
export function cronDetail(result: Record<string, unknown>): string {
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  const compact = Object.fromEntries(
    Object.entries(result).map(([k, v]) => [k, isObj(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== 0)) : v]),
  );
  const s = JSON.stringify(compact);
  if (s.length <= OPS_DETAIL_MAX) return s;
  return JSON.stringify({ ...Object.fromEntries(Object.entries(result).filter(([, v]) => !isObj(v) && !Array.isArray(v))), cut: true });
}
