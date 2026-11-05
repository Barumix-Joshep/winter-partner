// AI에 보내기 전 개인정보 최소화 (CLAUDE.md AI 원칙).
// - 알고 있는 손님·보호자 이름 → "손님A", "손님B" … (응답에서 되돌릴 수 있게 대응표를 돌려준다)
// - 휴대폰·일반 전화번호 → [전화], 이메일 → [이메일], 주민번호 형태 → [주민번호]
// - 건강 관련 단어 → [건강정보] (P13-4 단어 목록)
import { detectHealthTerms } from "@/lib/privacy/health";

export type Redaction = { text: string; aliases: Record<string, string> };

const PHONE = /(?:\+82[-\s]?|0)(?:1[016789]|[2-6]\d?)[-.\s]?\d{3,4}[-.\s]?\d{4}/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const RRN = /\d{6}[-\s]?[1-4]\d{6}/g;
// 손님 글 속 연락처 뽑기(src/lib/ai/consult/contact.ts)도 같은 규칙을 쓴다 (g 정규식은 lastIndex를 공유하므로 패턴 글자만 내보낸다)
export const PHONE_PATTERN = PHONE.source;
export const EMAIL_PATTERN = EMAIL.source;

const label = (i: number) => `손님${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ""}`;

export function redact(text: string, names: string[] = [], opts: { maskHealth?: boolean } = {}): Redaction {
  let out = text ?? "";
  const aliases: Record<string, string> = {};
  // 긴 이름부터 바꿔야 "김민" 이 "김민준" 일부를 먼저 먹지 않는다
  const uniq = [...new Set(names.map((n) => n.trim()).filter((n) => n.length >= 2))].sort((a, b) => b.length - a.length);
  uniq.forEach((name, i) => {
    const alias = label(i);
    if (out.includes(name)) {
      out = out.split(name).join(alias);
    }
    aliases[alias] = name;
  });
  out = out.replace(RRN, "[주민번호]").replace(EMAIL, "[이메일]").replace(PHONE, "[전화]");
  if (opts.maskHealth !== false) {
    for (const term of detectHealthTerms(out)) {
      out = out.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "[건강정보]");
    }
  }
  return { text: out, aliases };
}

// AI 응답 속 "손님A"를 실제 이름으로 되돌린다 (화면 표시용, 서버에서만)
export function restore(text: string, aliases: Record<string, string>) {
  return Object.keys(aliases)
    .sort((a, b) => b.length - a.length)
    .reduce((t, alias) => t.split(alias).join(aliases[alias]), text);
}

// 연락처·이메일이 남아 있지 않은지 (보내기 직전 마지막 확인)
export function hasContact(text: string) {
  return new RegExp(PHONE.source).test(text) || new RegExp(EMAIL.source).test(text) || new RegExp(RRN.source).test(text);
}
