import { describe, expect, it } from "vitest";
import { parseSelfRegister } from "./self-register";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  Object.entries(o).forEach(([k, v]) => f.set(k, v));
  return f;
};

describe("parseSelfRegister", () => {
  it("성인: 이름과 휴대폰", () => {
    const r = parseSelfRegister(fd({ name: " 김손님 ", phone: "01012345678", marketing: "on" }), 2026);
    expect(r).toEqual({
      ok: true,
      data: { name: "김손님", phone: "010-1234-5678", birthYear: null, level: null, equipmentSize: null, guardianName: null, guardianPhone: null, marketing: true, photo: false },
    });
  });
  it("성인은 휴대폰이 필요하다", () => {
    expect(parseSelfRegister(fd({ name: "김" }), 2026).ok).toBe(false);
  });
  it("14세 미만: 보호자 이름·휴대폰과 보호자 확인", () => {
    const r = parseSelfRegister(fd({ name: "아이", birth_year: "2018" }), 2026);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["guardian_confirm", "guardian_name", "guardian_phone"]);
    const ok = parseSelfRegister(fd({ name: "아이", birth_year: "2018", guardian_name: "엄마", guardian_phone: "010-2222-3333", guardian_confirm: "on" }), 2026);
    expect(ok.ok).toBe(true);
  });
  it("너무 긴 값은 자른다", () => {
    const r = parseSelfRegister(fd({ name: "가".repeat(100), phone: "010-1111-2222" }), 2026);
    expect(r.ok && r.data.name.length).toBe(40);
  });
});
