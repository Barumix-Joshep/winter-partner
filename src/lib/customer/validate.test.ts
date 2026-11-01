import { describe, expect, it } from "vitest";
import { normalizePhone, parseCustomer, parseTags } from "./validate";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("normalizePhone", () => {
  it("휴대폰 번호를 010-0000-0000으로", () => {
    expect(normalizePhone("01012345678")).toBe("010-1234-5678");
    expect(normalizePhone("010 1234 5678")).toBe("010-1234-5678");
    expect(normalizePhone("011-123-4567")).toBe("011-123-4567");
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("1234")).toBeUndefined();
  });
});

describe("parseTags", () => {
  it("# · 쉼표 · 띄어쓰기로 나눈다", () => {
    expect(parseTags("#가족 #재방문")).toEqual(["가족", "재방문"]);
    expect(parseTags("VIP, 단체,  ")).toEqual(["VIP", "단체"]);
    expect(parseTags("가족 가족")).toEqual(["가족"]);
  });
});

describe("parseCustomer", () => {
  const base = {
    name: " 박민준 ",
    phone: "",
    guardian_name: "박성훈",
    guardian_phone: "01098764821",
    level: "초급",
    equipment_size: "스키 120 · 부츠 220",
    tags: "#가족",
    memo: "동생과 같이 하면 집중도 좋음",
    next_contact_on: "2026-11-20",
    marketing_consent: "on",
  };

  it("손님 정보를 다듬는다", () => {
    expect(parseCustomer(form(base))).toEqual({
      ok: true,
      data: {
        name: "박민준",
        phone: null,
        guardian_name: "박성훈",
        guardian_phone: "010-9876-4821",
        level: "초급",
        equipment_size: "스키 120 · 부츠 220",
        tags: ["가족"],
        memo: "동생과 같이 하면 집중도 좋음",
        next_contact_on: "2026-11-20",
        marketing_consent: true,
      },
    });
  });

  it("이름은 필수, 번호와 날짜는 형식 확인", () => {
    const r = parseCustomer(form({ ...base, name: "", phone: "12", next_contact_on: "11/20" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.name).toBeDefined();
      expect(r.errors.phone).toBeDefined();
      expect(r.errors.next_contact_on).toBeDefined();
    }
  });

  it("동의 체크가 없으면 false", () => {
    const r = parseCustomer(form(Object.fromEntries(Object.entries(base).filter(([k]) => k !== "marketing_consent"))));
    expect(r.ok && r.data.marketing_consent).toBe(false);
  });
});
