import { describe, expect, it } from "vitest";
import { canonicalSport, detectSport, SPORTS, SPORTS_LABEL } from "./sports";

const ALL = [...SPORTS];

describe("종목 이름", () => {
  it("세 종목", () => {
    expect(ALL).toEqual(["스키", "스노우보드", "스노우스케이트"]);
    expect(SPORTS_LABEL).toBe("스키·스노우보드·스노우스케이트");
  });

  it.each([
    ["스키", "스키"],
    ["ski", "스키"],
    ["스노우보드", "스노우보드"],
    ["스노보드", "스노우보드"],
    ["스노 보드", "스노우보드"],
    ["보드", "스노우보드"],
    ["Snowboard", "스노우보드"],
    ["스노우스케이트", "스노우스케이트"],
    ["스노스케이트", "스노우스케이트"],
    ["스노우 스케이트", "스노우스케이트"],
    ["snowskate", "스노우스케이트"],
  ])("%s → %s", (raw, want) => {
    expect(canonicalSport(raw, ALL)).toBe(want);
  });

  it("샵이 하지 않는 종목이나 모르는 값은 null", () => {
    expect(canonicalSport("보드", ["스키"])).toBeNull();
    expect(canonicalSport("썰매", ALL)).toBeNull();
    expect(canonicalSport(null, ALL)).toBeNull();
  });

  it("글에서 종목 찾기 (스키장은 종목이 아니다)", () => {
    expect(detectSport("토요일 스노우보드 초급 2명")).toBe("스노우보드");
    expect(detectSport("하이원 스키장에서 보드 1:1")).toBe("스노우보드");
    expect(detectSport("스노 스케이트 체험 3명")).toBe("스노우스케이트");
    expect(detectSport("스키 개인강습")).toBe("스키");
    expect(detectSport("용평 스키장 강습 문의")).toBeNull();
  });
});
