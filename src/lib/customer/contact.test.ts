import { describe, expect, it } from "vitest";
import { formatDay, parseContact } from "./contact";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  Object.entries(o).forEach(([k, v]) => f.set(k, v));
  return f;
};

describe("parseContact", () => {
  it("연락 방법은 정해진 것만", () => {
    expect(parseContact(fd({ channel: "fax" })).ok).toBe(false);
  });
  it("다음 연락일과 목적", () => {
    expect(parseContact(fd({ channel: "phone", memo: " 시즌 안내 ", next_on: "2026-12-05", next_note: "예약 확정" }))).toEqual({
      ok: true,
      data: { channel: "phone", memo: "시즌 안내", nextOn: "2026-12-05", nextNote: "예약 확정" },
    });
  });
  it("다음 연락일이 없으면 목적도 비운다", () => {
    const r = parseContact(fd({ channel: "visit", next_note: "무시" }));
    expect(r.ok && r.data).toEqual({ channel: "visit", memo: null, nextOn: null, nextNote: null });
  });
  it("날짜 형식", () => {
    expect(parseContact(fd({ channel: "phone", next_on: "12/5" })).ok).toBe(false);
  });
});

describe("formatDay", () => {
  it("요일을 붙인다", () => {
    expect(formatDay("2026-11-20")).toBe("11/20(금)");
  });
});
