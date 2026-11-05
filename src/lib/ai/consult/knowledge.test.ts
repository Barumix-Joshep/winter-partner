import { describe, expect, it } from "vitest";
import { activeTotal, parseKnowledge } from "./knowledge";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe("안내 정보 검증", () => {
  it("정상", () => {
    expect(parseKnowledge(fd({ kind: "price", title: " 강습료 ", content: "1:1 2시간 120,000원", is_active: "on" }))).toEqual({
      ok: true,
      data: { kind: "price", title: "강습료", content: "1:1 2시간 120,000원", isActive: true },
    });
  });
  it("모르는 종류·빈 제목·긴 내용은 거부", () => {
    expect(parseKnowledge(fd({ kind: "secret", title: "x" })).ok).toBe(false);
    expect(parseKnowledge(fd({ kind: "faq", title: " " })).ok).toBe(false);
    expect(parseKnowledge(fd({ kind: "faq", title: "x".repeat(81) })).ok).toBe(false);
    expect(parseKnowledge(fd({ kind: "faq", title: "x", content: "y".repeat(2001) })).ok).toBe(false);
  });
  it("내용이 비었으면 사용으로 켤 수 없다", () => {
    expect(parseKnowledge(fd({ kind: "faq", title: "주차", content: "", is_active: "on" }))).toEqual({ ok: false, message: "내용을 채운 뒤 사용으로 바꿔 주세요." });
    expect(parseKnowledge(fd({ kind: "faq", title: "주차", content: "" })).ok).toBe(true);
  });
  it("켜 둔 글자 수 합은 바꿀 항목을 새 값으로 센다", () => {
    const items = [
      { id: "a", content: "12345", is_active: true },
      { id: "b", content: "123", is_active: false },
    ];
    expect(activeTotal(items)).toBe(5);
    expect(activeTotal(items, { id: "b", content: "123", isActive: true })).toBe(8);
    expect(activeTotal(items, { id: "a", content: "1", isActive: true })).toBe(1);
    expect(activeTotal(items, { id: null, content: "xx", isActive: true })).toBe(7);
  });
});
