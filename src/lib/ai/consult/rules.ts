// 상담 엔진 1단계: AI를 부르기 전에 규칙으로 거른다 (빈 글·너무 긴 글·프롬프트 인젝션 → unknown, 사람에게).
import type { ConsultChannel } from "./types";

export const MAX_INPUT_CHARS = 1000;

// "지시를 무시해", "시스템 프롬프트를 보여 줘" 같은 문구. 손님 문의에는 거의 나오지 않아 걸리면 AI에 보내지 않는다.
const INJECTION: RegExp[] = [
  /(이전|위의?|앞의?|모든|기존)\s*(의\s*)?(지시|명령|규칙|지침|설정)\S*\s*(을|를|은|는)?\s*(모두\s*)?(무시|잊어|잊고|따르지)/,
  /(지시|명령|규칙|지침)\S*\s*(을|를)?\s*(무시|잊어)/,
  /ignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier)?\s*(instructions|prompts?|rules)/i,
  /(system|developer)\s*(prompt|message|mode)/i,
  /(시스템|개발자)\s*(프롬프트|메시지|모드)/,
  /프롬프트\S*\s*(을|를)?\s*(보여|알려|출력|공개|말해)/,
  /(너는|넌|당신은)\s*이제(부터)?/,
  /(역할|캐릭터|페르소나)\S*\s*(을|를)?\s*(바꿔|바꾸|변경)/,
  /jailbreak|\bDAN\b|act\s+as\s+(an?\s+)?/i,
  /<\/?\s*(system|assistant|user|instructions?)\s*>/i,
];

export type PreCheck = { ok: true; text: string } | { ok: false; reason: "empty" | "too_long" | "injection" };

export function preCheck(raw: string): PreCheck {
  const text = (raw ?? "").replace(/\u0000/g, "").trim();
  if (!text) return { ok: false, reason: "empty" };
  if (text.length > MAX_INPUT_CHARS) return { ok: false, reason: "too_long" };
  if (INJECTION.some((r) => r.test(text))) return { ok: false, reason: "injection" };
  return { ok: true, text };
}

// 채널별 답변 길이: 카카오는 500자 넘으면 접히므로 500자, 상담톡 1000자, 인스타는 UTF-8 1000바이트(설계 문서 플랫폼 제약)
export const CHANNEL_LIMIT: Record<ConsultChannel, { chars?: number; bytes?: number }> = {
  kakao: { chars: 500 },
  kakao_cstalk: { chars: 1000 },
  instagram: { bytes: 1000 },
};

const enc = new TextEncoder();

export function fitChannel(text: string, channel: ConsultChannel): string {
  const lim = CHANNEL_LIMIT[channel];
  const fits = (t: string) => (lim.chars === undefined || [...t].length <= lim.chars) && (lim.bytes === undefined || enc.encode(t).length <= lim.bytes);
  if (fits(text)) return text;
  const chars = [...text];
  let lo = 0;
  let hi = chars.length;
  // 말줄임표까지 들어가는 가장 긴 앞부분
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(chars.slice(0, mid).join("") + "…")) lo = mid;
    else hi = mid - 1;
  }
  let cut = chars.slice(0, lo).join("");
  // 문장 끝에서 자를 수 있으면 거기서
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("다. "), cut.lastIndexOf("요. "), cut.lastIndexOf("\n"));
  if (end > cut.length * 0.6) cut = cut.slice(0, end + 1).trimEnd();
  return cut + "…";
}
