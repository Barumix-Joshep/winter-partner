// 의견 보내기 입력 (P16-6). 본문에 섞인 전화번호·이메일·주민번호 형태는 가린다.
import { redact } from "@/lib/ai/redact";

export type FeedbackInput = { body: string; path: string; contact: string | null; masked: boolean };
type Result = { ok: true; data: FeedbackInput } | { ok: false; error: string };

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

export function parseFeedback(fd: FormData): Result {
  const raw = str(fd, "body");
  if (!raw) return { ok: false, error: "내용을 적어 주세요." };
  if (raw.length > 2000) return { ok: false, error: "2,000자까지 적을 수 있습니다." };
  const body = redact(raw, [], { maskHealth: false }).text;
  const p = str(fd, "path");
  const path = p.startsWith("/") && !p.startsWith("//") ? p.split(/[?#]/)[0].slice(0, 300) : "/";
  const contact = str(fd, "contact").slice(0, 100) || null;
  return { ok: true, data: { body, path, contact, masked: body !== raw } };
}
