import { describe, expect, it } from "vitest";
import { pageInfo, pageRange, parsePage } from "./paging";

describe("쪽 나누기 (P19-3)", () => {
  it("쪽 번호는 1 이상 정수, 아니면 1", () => {
    expect([parsePage("3"), parsePage("0"), parsePage("-1"), parsePage("1.5"), parsePage("x"), parsePage(undefined)]).toEqual([3, 1, 1, 1, 1, 1]);
  });
  it("범위와 표시", () => {
    expect(pageRange(1, 200)).toEqual([0, 199]);
    expect(pageRange(3, 200)).toEqual([400, 599]);
    expect(pageInfo(1, 200, 1001)).toMatchObject({ pages: 6, from: 1, to: 200, prev: null, next: 2, truncated: true });
    expect(pageInfo(6, 200, 1001)).toMatchObject({ from: 1001, to: 1001, prev: 5, next: null });
    expect(pageInfo(9, 200, 1001).page).toBe(6); // 넘치는 쪽은 마지막 쪽으로
    expect(pageInfo(1, 200, 150)).toMatchObject({ truncated: false, next: null });
    expect(pageInfo(1, 200, 0)).toMatchObject({ from: 0, to: 0, pages: 1 });
  });
});
