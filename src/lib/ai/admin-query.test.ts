import { describe, expect, it } from "vitest";
import { parseQuery, querySystem } from "./admin-query";

describe("admin query", () => {
  it("정의된 집계만 받는다", () => {
    expect(parseQuery({ metric: "jobs_by_shop", month: "2026-12" })).toEqual({ metric: "jobs_by_shop", month: "2026-12" });
    expect(parseQuery({ metric: "select * from customers", month: "2026-13" })).toEqual({ metric: null, month: null });
  });
  it("목록과 오늘 날짜를 알려 준다", () => {
    const s = querySystem("2026-12-01");
    expect(s).toContain("jobs_by_shop: 샵별 강습 수");
    expect(s).toContain("오늘은 2026-12-01");
  });
});
