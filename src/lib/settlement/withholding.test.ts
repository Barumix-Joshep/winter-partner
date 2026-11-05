import { describe, expect, it } from "vitest";
import { withholding } from "./withholding";

describe("withholding (사업소득 3.3%)", () => {
  it("소득세 3% + 지방세 0.3%, 10원 미만 절사", () => {
    expect(withholding(230000)).toEqual({ incomeTax: 6900, localTax: 690, total: 7590, net: 222410 });
    expect(withholding(123456)).toEqual({ incomeTax: 3700, localTax: 370, total: 4070, net: 119386 });
  });

  it("소득세 1,000원 미만이면 떼지 않는다 (소액부징수)", () => {
    expect(withholding(30000)).toEqual({ incomeTax: 0, localTax: 0, total: 0, net: 30000 });
    expect(withholding(33340).incomeTax).toBe(1000);
  });

  it("면제 경계 (P19-1): 소득세 999원은 면제, 1,000원부터 징수", () => {
    expect(withholding(33330)).toEqual({ incomeTax: 0, localTax: 0, total: 0, net: 33330 }); // 999.9 → 990 → 면제
    expect(withholding(33333)).toEqual({ incomeTax: 0, localTax: 0, total: 0, net: 33333 });
    expect(withholding(33340)).toEqual({ incomeTax: 1000, localTax: 100, total: 1100, net: 32240 });
    expect(withholding(33679)).toEqual({ incomeTax: 1010, localTax: 100, total: 1110, net: 32569 }); // 지방세 101 → 100
  });

  it("팀(사업자) 지급은 원천세 없음", () => {
    expect(withholding(500000, false)).toEqual({ incomeTax: 0, localTax: 0, total: 0, net: 500000 });
  });
});
