import { describe, expect, it } from "vitest";
import { compareCert, norm, parseCertExtract, toStoredExtract } from "./cert";

const ex = { issuer: "KSIA 대한스키지도자연맹", grade: "레벨 2", holderName: "김 스키", issuedOn: "2024-03-01", expiresOn: "2028-02-28", numberLast4: "1234", readable: true };

describe("parseCertExtract", () => {
  it("자격번호는 끝 4자리만, 날짜 형식 확인", () => {
    expect(parseCertExtract({ issuer: "KSIA", grade: "2급", holder_name: "김스키", issued_on: "2024.03.01", expires_on: "2028-02-28", number_last4: "KS-00991234", readable: true })).toMatchObject({
      issuedOn: null,
      expiresOn: "2028-02-28",
      numberLast4: "1234",
    });
  });
  it("저장한 모양을 다시 읽으면 같은 값", () => {
    const ex = parseCertExtract({ issuer: "KSIA", grade: "2급", holder_name: "김스키", issued_on: null, expires_on: "2028-02-28", number_last4: "1234", readable: true })!;
    expect(parseCertExtract(toStoredExtract(ex))).toEqual(ex);
  });
  it("readable이 없으면 무효", () => expect(parseCertExtract({ issuer: "x" })).toBeNull());
});

describe("compareCert", () => {
  it("표기 차이는 같은 것으로", () => {
    expect(norm("Level 2")).toBe(norm("레벨2"));
    const r = compareCert({ issuer: "KSIA", grade: "Level 2", profileName: "김스키" }, ex, "2026-11-02");
    expect(r.checks.every((c) => c.ok)).toBe(true);
    expect(r.needsReview).toBe(false);
  });
  it("성명이 다르면 확인 필요", () => {
    const r = compareCert({ issuer: "KSIA", grade: "Level 2", profileName: "이보드" }, ex, "2026-11-02");
    expect(r.checks.find((c) => c.field === "holderName")?.ok).toBe(false);
    expect(r.needsReview).toBe(true);
  });
  it("만료된 자격증은 확인 필요", () => {
    expect(compareCert({ issuer: "KSIA", grade: "Level 2", profileName: "김스키" }, { ...ex, expiresOn: "2025-01-01" }, "2026-11-02").needsReview).toBe(true);
  });
  it("등급이 다르면 빨강 표시", () => {
    expect(compareCert({ issuer: "KSIA", grade: "Level 3", profileName: "김스키" }, ex, "2026-11-02").checks.find((c) => c.field === "grade")?.ok).toBe(false);
  });
  it("판독 불가면 확인 필요", () => {
    expect(compareCert({ issuer: "KSIA", grade: null, profileName: "김스키" }, { ...ex, readable: false }, "2026-11-02").needsReview).toBe(true);
  });
});
