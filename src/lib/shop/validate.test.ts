import { describe, expect, it } from "vitest";
import { parseShop } from "./validate";

function form(fields: Record<string, string | string[]>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) fd.append(k, x);
  return fd;
}

describe("parseShop", () => {
  const base = { type: "rental_shop", name: " 하이원 렌탈 ", business_no: "", owner_name: "", resort_ids: ["8", "6"] };

  it("샵 정보를 다듬어 돌려준다", () => {
    expect(parseShop(form(base))).toEqual({
      ok: true,
      data: { type: "rental_shop", name: "하이원 렌탈", businessNo: null, ownerName: null, resortIds: [8, 6] },
    });
  });

  it("사업자번호는 10자리 숫자를 000-00-00000으로 맞춘다", () => {
    const r = parseShop(form({ ...base, business_no: "1234567890" }));
    expect(r.ok && r.data.businessNo).toBe("123-45-67890");
    expect(parseShop(form({ ...base, business_no: "12-34" })).ok).toBe(false);
  });

  it("종류·이름·영업 스키장은 필수", () => {
    const r = parseShop(form({ type: "hotel", name: "", resort_ids: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.type).toBeDefined();
      expect(r.errors.name).toBeDefined();
      expect(r.errors.resortIds).toBeDefined();
    }
  });

  it("스키장 번호가 숫자가 아니면 막는다", () => {
    expect(parseShop(form({ ...base, resort_ids: ["1", "x"] })).ok).toBe(false);
  });
});
