import { describe, expect, it } from "vitest";
import { configuredSiteUrl, normalizeSiteUrl, originFromHeaders, vapidSubject } from "./site-url";

describe("normalizeSiteUrl", () => {
  it("주소의 origin만 남긴다", () => {
    expect(normalizeSiteUrl("https://winter-partner.co.kr")).toBe("https://winter-partner.co.kr");
    expect(normalizeSiteUrl(" https://winter-partner.co.kr/ ")).toBe("https://winter-partner.co.kr");
    expect(normalizeSiteUrl("https://winter-partner.co.kr/login?x=1")).toBe("https://winter-partner.co.kr");
    expect(normalizeSiteUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });
  it("비었거나 잘못된 값은 null (요청 주소를 쓰게)", () => {
    expect(normalizeSiteUrl(undefined)).toBeNull();
    expect(normalizeSiteUrl("")).toBeNull();
    expect(normalizeSiteUrl("winter-partner.co.kr")).toBeNull();
    expect(normalizeSiteUrl("ftp://winter-partner.co.kr")).toBeNull();
    expect(normalizeSiteUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("configuredSiteUrl", () => {
  it("SITE_URL을 읽는다", () => {
    expect(configuredSiteUrl({ SITE_URL: "https://winter-partner.co.kr/" })).toBe("https://winter-partner.co.kr");
    expect(configuredSiteUrl({})).toBeNull();
  });
});

describe("originFromHeaders", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("프록시 헤더를 먼저 본다", () => {
    expect(originFromHeaders(h({ "x-forwarded-host": "winter-partner.co.kr", "x-forwarded-proto": "https", host: "x.vercel.app" }))).toBe(
      "https://winter-partner.co.kr",
    );
  });
  it("host만 있으면 https, localhost는 http", () => {
    expect(originFromHeaders(h({ host: "winter-partner.vercel.app" }))).toBe("https://winter-partner.vercel.app");
    expect(originFromHeaders(h({ host: "localhost:3100" }))).toBe("http://localhost:3100");
    expect(originFromHeaders(h({ host: "127.0.0.1:3000" }))).toBe("http://127.0.0.1:3000");
    expect(originFromHeaders(h({}))).toBe("http://localhost:3000");
  });
});

describe("vapidSubject", () => {
  it("VAPID_SUBJECT → SITE_URL → 지금 운영 주소", () => {
    expect(vapidSubject({ VAPID_SUBJECT: "mailto:ops@winter-partner.co.kr", SITE_URL: "https://winter-partner.co.kr" })).toBe("mailto:ops@winter-partner.co.kr");
    expect(vapidSubject({ SITE_URL: "https://winter-partner.co.kr" })).toBe("https://winter-partner.co.kr");
    expect(vapidSubject({})).toBe("https://winter-partner.vercel.app");
  });
});
