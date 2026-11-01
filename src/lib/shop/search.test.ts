import { describe, expect, it } from "vitest";
import { parseSearch, slotRange } from "./search";

describe("slotRange", () => {
  it("한국 시간 기준 시간대를 돌려준다", () => {
    expect(slotRange("2026-12-20", "am")).toEqual({ from: "2026-12-20T09:00:00+09:00", to: "2026-12-20T12:00:00+09:00" });
    expect(slotRange("2026-12-20", "pm")).toEqual({ from: "2026-12-20T13:00:00+09:00", to: "2026-12-20T17:00:00+09:00" });
    expect(slotRange("2026-12-20", "night")).toEqual({ from: "2026-12-20T18:00:00+09:00", to: "2026-12-20T22:00:00+09:00" });
  });

  it("날짜가 없거나 잘못되면 시간 조건을 걸지 않는다", () => {
    expect(slotRange("", "am")).toBeNull();
    expect(slotRange("2026-13-40", "am")).toBeNull();
    expect(slotRange("2026-12-20", "lunch")).toBeNull();
  });
});

describe("parseSearch", () => {
  const resorts = [8, 6];

  it("영업 스키장이 아니면 첫 영업 스키장으로", () => {
    expect(parseSearch({ resort: "1" }, resorts).resortId).toBe(8);
    expect(parseSearch({ resort: "6" }, resorts).resortId).toBe(6);
    expect(parseSearch({}, resorts).resortId).toBe(8);
  });

  it("종목·날짜·시간대를 읽는다", () => {
    expect(parseSearch({ sport: "2", date: "2026-12-20", slot: "pm" }, resorts)).toEqual({
      resortId: 8,
      sportId: 2,
      date: "2026-12-20",
      slot: "pm",
      range: { from: "2026-12-20T13:00:00+09:00", to: "2026-12-20T17:00:00+09:00" },
    });
    expect(parseSearch({ sport: "abc" }, resorts).sportId).toBeNull();
  });
});
