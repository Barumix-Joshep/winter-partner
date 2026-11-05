// P22-6 손님 글 속 연락처: 서버 규칙으로 뽑아(AI 아님) 문의에 암호화해 두고, 저장·화면에는 가린 글만.
import { describe, expect, it } from "vitest";
import { extractContact, maskContact, maskContactsInText } from "./contact";

describe("extractContact", () => {
  it("휴대폰 번호를 뽑고 글에서는 가운데를 가린다", () => {
    const r = extractContact("12월 20일 2명이요. 010-0000-1234로 연락 주세요");
    expect(r.contact).toBe("010-0000-1234");
    expect(r.masked).toBe("12월 20일 2명이요. 010-****-1234로 연락 주세요");
  });
  it("붙여 쓴 번호·+82 번호도 같은 형식으로", () => {
    expect(extractContact("01000001234").contact).toBe("010-0000-1234");
    expect(extractContact("+82 10-0000-5678 이요").contact).toBe("010-0000-5678");
  });
  it("이메일은 앞 한 글자만 남긴다", () => {
    const r = extractContact("메일은 test.user@example.com 이에요");
    expect(r.contact).toBe("test.user@example.com");
    expect(r.masked).toBe("메일은 t***@example.com 이에요");
  });
  it("전화와 이메일이 함께 있으면 둘 다(중복 없이)", () => {
    const r = extractContact("010-0000-1234 / a@example.com / 010 0000 1234");
    expect(r.contact).toBe("010-0000-1234, a@example.com");
    expect(r.masked).not.toMatch(/0000-1234|a@example/);
  });
  it("연락처가 없으면 null, 글은 그대로", () => {
    expect(extractContact("강습료 얼마예요? 2시간 120,000원 맞나요")).toEqual({ contact: null, masked: "강습료 얼마예요? 2시간 120,000원 맞나요" });
    expect(extractContact("")).toEqual({ contact: null, masked: "" });
  });
});

describe("maskContact", () => {
  it("여러 개를 저장한 값도 하나씩 가린다", () => {
    expect(maskContact("010-0000-1234, a@example.com")).toBe("010-****-1234, a***@example.com");
    expect(maskContact(null)).toBe("");
  });
});

describe("maskContactsInText", () => {
  it("화면에 보낼 글 속 번호·이메일을 가린다(예전에 원문으로 저장된 글도)", () => {
    expect(maskContactsInText("연락처 010-0000-9999, me@example.com")).toBe("연락처 010-****-9999, m***@example.com");
    expect(maskContactsInText(null)).toBe("");
  });
});
