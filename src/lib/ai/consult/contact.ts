// AI 상담(P22-6) 손님 연락처 처리. AI가 아니라 서버 규칙(src/lib/ai/redact.ts와 같은 정규식)으로 뽑는다.
// - 뽑은 연락처는 웹훅 저장 쪽(src/lib/channels/store.ts)이 encryptSecret으로 암호화해 inquiries.contact_enc에만 둔다.
// - 메시지 표(messages.text)에는 가린 글만 저장하고, 화면은 maskContact·maskContactsInText로 가린 값만 보여 준다.
// - 로그에는 연락처를 쓰지 않는다(있었는지도 남기지 않는다).
import { maskPhone } from "@/lib/privacy/mask";
import { EMAIL_PATTERN, PHONE_PATTERN } from "@/lib/ai/redact";

const MAX_CONTACTS = 3; // 문의 하나에 둘 연락처 수 (도배 글 대비)

const phoneRe = () => new RegExp(PHONE_PATTERN, "g");
const emailRe = () => new RegExp(EMAIL_PATTERN, "g");

// 010-0000-1234 형식으로 (+82는 0으로)
function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("+82")) d = "0" + d.slice(2);
  if (d.startsWith("02")) return d.length === 9 ? `02-${d.slice(2, 5)}-${d.slice(5)}` : `02-${d.slice(2, 6)}-${d.slice(6)}`;
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

function maskEmail(v: string) {
  const [user, domain] = v.split("@");
  return `${user.slice(0, 1)}***@${domain}`;
}

// 화면 표시용 (전화는 010-****-1234, 이메일은 앞 한 글자만). 여러 개는 ", "로 이어 저장한다.
export function maskContact(v: string | null | undefined): string {
  if (!v) return "";
  return v
    .split(", ")
    .map((one) => (one.includes("@") ? maskEmail(one) : maskPhone(one)))
    .join(", ");
}

// 글 속 번호·이메일을 가린다 (저장 전 손님 글, 화면에 보낼 글)
export function maskContactsInText(text: string | null | undefined): string {
  return (text ?? "").replace(emailRe(), (m) => maskEmail(m)).replace(phoneRe(), (m) => maskPhone(m));
}

// 손님 글에서 연락처를 뽑는다. contact는 암호화해 둘 값(없으면 null), masked는 저장·표시용 글.
export function extractContact(text: string | null | undefined): { contact: string | null; masked: string } {
  const src = text ?? "";
  const found: string[] = [];
  for (const m of src.match(phoneRe()) ?? []) found.push(normalizePhone(m));
  for (const m of src.match(emailRe()) ?? []) found.push(m.toLowerCase());
  const uniq = [...new Set(found)].slice(0, MAX_CONTACTS);
  return { contact: uniq.length ? uniq.join(", ") : null, masked: maskContactsInText(src) };
}
