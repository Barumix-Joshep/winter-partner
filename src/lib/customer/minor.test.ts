import { describe, expect, it } from "vitest";
import { isMinor, kstYear, parseBirthYear } from "./minor";

describe("isMinor", () => {
  it("올해 기준 14살 이하면 14세 미만으로 본다", () => {
    expect(isMinor(2016, 2026)).toBe(true);
    expect(isMinor(2012, 2026)).toBe(true);
    expect(isMinor(2011, 2026)).toBe(false);
    expect(isMinor(null, 2026)).toBe(false);
  });
});

describe("parseBirthYear", () => {
  it("네 자리 연도만", () => {
    expect(parseBirthYear("", 2026)).toBeNull();
    expect(parseBirthYear("2015", 2026)).toBe(2015);
    expect(parseBirthYear("15", 2026)).toBeUndefined();
    expect(parseBirthYear("2030", 2026)).toBeUndefined();
    expect(parseBirthYear("1900", 2026)).toBeUndefined();
  });
});

describe("kstYear", () => {
  it("한국 시간 기준 연도", () => {
    expect(kstYear(Date.parse("2026-12-31T16:00:00Z"))).toBe(2027);
  });
});
