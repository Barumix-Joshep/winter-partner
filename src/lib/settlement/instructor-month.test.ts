import { describe, expect, it } from "vitest";
import { instructorMonth } from "./instructor-month";

const shopA = { id: "A", name: "하이원 스노우렌탈" };
const shopB = { id: "B", name: "용평 알파인샵" };

describe("instructorMonth", () => {
  it("샵별로 승인 강습을 모으고, 정산서가 있으면 그 상태와 금액을 쓴다", () => {
    const m = instructorMonth(
      [
        { amount: 120000, status: "approved", shop: shopA },
        { amount: 80000, status: "approved", shop: shopA },
        { amount: 90000, status: "done", shop: shopA },
        { amount: 30000, status: "approved", shop: shopB },
        { amount: 70000, status: "canceled", shop: shopB },
      ],
      [{ id: "s1", shopId: "A", gross: 200000, withholding: 6600, net: 193400, status: "paid" }],
    );
    expect(m.total).toEqual({ approvedCount: 3, gross: 230000, withholding: 6600, net: 223400 });
    expect(m.shops).toEqual([
      { shopId: "A", name: "하이원 스노우렌탈", count: 2, gross: 200000, net: 193400, state: "지급 완료", settlementId: "s1", pending: 1 },
      { shopId: "B", name: "용평 알파인샵", count: 1, gross: 30000, net: 30000, state: "집계 전", settlementId: null, pending: 0 },
    ]);
  });

  it("정산서 상태 이름", () => {
    const m = instructorMonth([{ amount: 100000, status: "approved", shop: shopA }], [
      { id: "s", shopId: "A", gross: 100000, withholding: 3300, net: 96700, status: "issued" },
    ]);
    expect(m.shops[0].state).toBe("지급 대기");
  });
});
