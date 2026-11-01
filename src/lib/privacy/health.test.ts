import { describe, expect, it } from "vitest";
import { detectHealthTerms, healthWarning } from "./health";

describe("detectHealthTerms", () => {
  it("건강 관련 단어를 찾는다", () => {
    expect(detectHealthTerms("작년에 무릎 인대 부상, 천식 있음")).toEqual(["부상", "인대", "천식"]);
    expect(detectHealthTerms("ADHD 진단")).toEqual(["진단", "adhd"]);
  });
  it("수업 내용만 있으면 없다", () => {
    expect(detectHealthTerms("플루그보겐 좌우 가능, 다음엔 리프트 혼자 타기")).toEqual([]);
    expect(detectHealthTerms(null)).toEqual([]);
  });
  it("경고 문구", () => {
    expect(healthWarning(["골절"])).toContain("(골절)");
  });
});
