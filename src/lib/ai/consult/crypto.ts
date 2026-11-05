import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { maskPhone } from "@/lib/privacy/mask";

// AI 상담(P22) 비밀·개인 식별 값 보관.
// - 채널 토큰·웹훅 비밀·손님 연락처: AES-256-GCM으로 암호화해 "v1.<base64(iv 12 | tag 16 | 암호문)>"으로만 DB에 둔다
//   (DB CHECK private.is_encrypted가 이 형식만 받는다). 키: CONSULT_ENCRYPTION_KEY (base64로 적은 32바이트).
// - 카카오·인스타 손님 id: HMAC-SHA256 16진수 64자만 둔다(원래 id로 되돌릴 수 없다). 키: CONSULT_HASH_KEY (32자 이상).
// 키 값은 .env.local·Vercel 환경변수에만 두고 로그에 쓰지 않는다.

export const ENC_PATTERN = /^v1\.[A-Za-z0-9+/]+={0,2}$/;
const IV = 12;
const TAG = 16;

function encKey(k = process.env.CONSULT_ENCRYPTION_KEY) {
  if (!k) throw new Error("CONSULT_ENCRYPTION_KEY가 없습니다");
  const buf = Buffer.from(k, "base64");
  if (buf.length !== 32) throw new Error("CONSULT_ENCRYPTION_KEY는 base64로 적은 32바이트여야 합니다");
  return buf;
}

function hashKey(k = process.env.CONSULT_HASH_KEY) {
  if (!k || k.length < 32) throw new Error("CONSULT_HASH_KEY가 없거나 32자보다 짧습니다");
  return k;
}

export function encryptSecret(plain: string, key?: string): string {
  const iv = randomBytes(IV);
  const cipher = createCipheriv("aes-256-gcm", encKey(key ?? process.env.CONSULT_ENCRYPTION_KEY), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return "v1." + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptSecret(enc: string, key?: string): string {
  if (!ENC_PATTERN.test(enc)) throw new Error("암호화 형식이 아닙니다");
  const raw = Buffer.from(enc.slice(3), "base64");
  if (raw.length < IV + TAG) throw new Error("암호화 형식이 아닙니다");
  const decipher = createDecipheriv("aes-256-gcm", encKey(key ?? process.env.CONSULT_ENCRYPTION_KEY), raw.subarray(0, IV));
  decipher.setAuthTag(raw.subarray(IV, IV + TAG));
  return Buffer.concat([decipher.update(raw.subarray(IV + TAG)), decipher.final()]).toString("utf8");
}

export function hashExternalId(channel: string, externalId: string, key?: string): string {
  return createHmac("sha256", hashKey(key ?? process.env.CONSULT_HASH_KEY)).update(`${channel}:${externalId}`).digest("hex");
}

// 화면 표시용 (전화는 010-****-1234, 이메일은 앞 한 글자만)
export function maskContact(v: string | null | undefined): string {
  if (!v) return "";
  if (v.includes("@")) {
    const [user, domain] = v.split("@");
    return `${user.slice(0, 1)}***@${domain}`;
  }
  return maskPhone(v);
}
