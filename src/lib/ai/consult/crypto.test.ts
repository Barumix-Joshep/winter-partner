import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, ENC_PATTERN, hashExternalId, maskContact } from "./crypto";

const key = randomBytes(32).toString("base64");
const hashKey = "test-hash-key-0123456789abcdef0123456789";

describe("AES-256-GCM 암호화", () => {
  it("암호화한 값은 DB 형식(v1.base64)이고 되돌릴 수 있다", () => {
    const enc = encryptSecret("010-0000-1234", key);
    expect(enc).toMatch(ENC_PATTERN);
    expect(enc).not.toContain("010");
    expect(decryptSecret(enc, key)).toBe("010-0000-1234");
  });
  it("같은 값도 매번 다르게 암호화된다(무작위 IV)", () => {
    expect(encryptSecret("abc", key)).not.toBe(encryptSecret("abc", key));
  });
  it("한글·긴 값", () => {
    const v = "인스타 토큰 ".repeat(200);
    expect(decryptSecret(encryptSecret(v, key), key)).toBe(v);
  });
  it("값을 바꾸면(변조) 풀리지 않는다", () => {
    const enc = encryptSecret("secret", key);
    const raw = Buffer.from(enc.slice(3), "base64");
    raw[raw.length - 1] ^= 1;
    expect(() => decryptSecret("v1." + raw.toString("base64"), key)).toThrow();
  });
  it("다른 키로는 풀리지 않는다", () => {
    expect(() => decryptSecret(encryptSecret("secret", key), randomBytes(32).toString("base64"))).toThrow();
  });
  it("키가 없거나 32바이트가 아니면 거부한다", () => {
    expect(() => encryptSecret("x", "")).toThrow(/CONSULT_ENCRYPTION_KEY/);
    expect(() => encryptSecret("x", randomBytes(16).toString("base64"))).toThrow(/32바이트/);
  });
  it("모르는 형식은 거부한다", () => {
    expect(() => decryptSecret("plain", key)).toThrow();
    expect(() => decryptSecret("v2.AAAA", key)).toThrow();
  });
});

describe("손님 id HMAC 해시", () => {
  it("64자 16진수, 같은 입력이면 같은 값", () => {
    const h = hashExternalId("kakao", "user-1", hashKey);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashExternalId("kakao", "user-1", hashKey)).toBe(h);
  });
  it("채널이나 키가 다르면 다른 값 (원래 id를 알 수 없다)", () => {
    const h = hashExternalId("kakao", "user-1", hashKey);
    expect(hashExternalId("instagram", "user-1", hashKey)).not.toBe(h);
    expect(hashExternalId("kakao", "user-1", hashKey + "x")).not.toBe(h);
    expect(h).not.toContain("user");
  });
  it("키가 짧으면 거부한다", () => {
    expect(() => hashExternalId("kakao", "u", "short")).toThrow(/CONSULT_HASH_KEY/);
  });
});

describe("연락처 마스킹", () => {
  it("010-****-1234", () => {
    expect(maskContact("01000001234")).toBe("010-****-1234");
    expect(maskContact("me@example.com")).toBe("m***@example.com");
    expect(maskContact("")).toBe("");
  });
});
