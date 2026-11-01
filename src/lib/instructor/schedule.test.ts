import { describe, expect, it } from "vitest";
import { cellKey, coveredCells, rangesFromCells, weekDays, weekStartOf } from "./schedule";

describe("weekStartOf", () => {
  it("한국 날짜 기준 그 주 일요일", () => {
    expect(weekStartOf("2026-12-24")).toBe("2026-12-20"); // 목 → 일
    expect(weekStartOf("2026-12-20")).toBe("2026-12-20");
  });
});

describe("weekDays", () => {
  it("일~토 7일", () => {
    expect(weekDays("2026-12-20")).toEqual(["2026-12-20", "2026-12-21", "2026-12-22", "2026-12-23", "2026-12-24", "2026-12-25", "2026-12-26"]);
    expect(weekDays("2026-12-27")[5]).toBe("2027-01-01");
  });
});

describe("rangesFromCells", () => {
  it("붙어 있는 시간대는 하나로 합친다 (오전+오후 = 09~18)", () => {
    expect(rangesFromCells([cellKey("2026-12-20", "am"), cellKey("2026-12-20", "pm"), cellKey("2026-12-21", "night")])).toEqual([
      { starts: "2026-12-20T09:00:00+09:00", ends: "2026-12-20T18:00:00+09:00" },
      { starts: "2026-12-21T18:00:00+09:00", ends: "2026-12-21T22:00:00+09:00" },
    ]);
  });

  it("오전과 야간은 떨어져 있어 따로", () => {
    expect(rangesFromCells([cellKey("2026-12-20", "night"), cellKey("2026-12-20", "am")])).toHaveLength(2);
  });

  it("잘못된 칸은 버린다", () => {
    expect(rangesFromCells(["2026-12-20:lunch", "nope"])).toEqual([]);
  });
});

describe("coveredCells", () => {
  it("저장된 가능 시간이 덮는 칸", () => {
    const cells = coveredCells(
      [{ starts_at: "2026-12-20T00:00:00Z", ends_at: "2026-12-20T09:00:00Z" }], // 09~18 KST
      ["2026-12-20"],
    );
    expect([...cells].sort()).toEqual(["2026-12-20:am", "2026-12-20:pm"]);
  });

  it("일부만 덮으면 그 칸은 아니다", () => {
    const cells = coveredCells([{ starts_at: "2026-12-20T01:00:00Z", ends_at: "2026-12-20T04:00:00Z" }], ["2026-12-20"]); // 10~13
    expect(cells.size).toBe(0);
  });
});
