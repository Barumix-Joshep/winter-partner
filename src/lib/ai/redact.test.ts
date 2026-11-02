import { describe, expect, it } from "vitest";
import { hasContact, redact, restore } from "./redact";

describe("redact: 전화번호", () => {
  const cases: [string, string][] = [
    ["010-1234-5678로 연락", "[전화]로 연락"],
    ["01012345678", "[전화]"],
    ["010 1234 5678", "[전화]"],
    ["010.1234.5678", "[전화]"],
    ["011-123-4567", "[전화]"],
    ["+82 10-1234-5678", "[전화]"],
    ["+82-10-1234-5678", "[전화]"],
    ["02-123-4567 매장", "[전화] 매장"],
    ["033-123-4567", "[전화]"],
    ["번호 01098765432 입니다", "번호 [전화] 입니다"],
  ];
  it.each(cases)("%s", (input, want) => expect(redact(input).text).toBe(want));
});

describe("redact: 이메일·주민번호", () => {
  const cases: [string, string][] = [
    ["mail: kim@example.com", "mail: [이메일]"],
    ["a.b+c@test.co.kr 로", "[이메일] 로"],
    ["900101-1234567", "[주민번호]"],
    ["9001011234567", "[주민번호]"],
  ];
  it.each(cases)("%s", (input, want) => expect(redact(input).text).toBe(want));
});

describe("redact: 이름 치환", () => {
  it("알려 준 이름을 손님A·B로", () => {
    const r = redact("박민준 외 1명, 동생 박서윤", ["박민준", "박서윤"]);
    expect(r.text).toBe("손님A 외 1명, 동생 손님B");
    expect(r.aliases).toEqual({ 손님A: "박민준", 손님B: "박서윤" });
  });
  it("긴 이름부터 바꾼다", () => {
    expect(redact("김민준과 김민", ["김민", "김민준"]).text).toBe("손님A과 손님B");
  });
  it("한 글자 이름은 치환하지 않는다(오탐 방지)", () => {
    expect(redact("김 선생님", ["김"]).text).toBe("김 선생님");
  });
  it("이름이 여러 번 나와도 모두", () => {
    expect(redact("이서아 초급, 이서아 어머니", ["이서아"]).text).toBe("손님A 초급, 손님A 어머니");
  });
  it("공백 섞인 이름 목록", () => {
    expect(redact("정하늘", [" 정하늘 ", ""]).text).toBe("손님A");
  });
  it("되돌리기", () => {
    const r = redact("박민준은 플루그 가능", ["박민준"]);
    expect(restore("손님A에게 다음엔 리프트 연습", r.aliases)).toBe("박민준에게 다음엔 리프트 연습");
  });
  it("손님A와 손님A1이 섞여도 긴 것부터 되돌린다", () => {
    expect(restore("손님A 손님A1", { 손님A: "가", 손님A1: "나" })).toBe("가 나");
  });
});

describe("redact: 건강 단어", () => {
  const cases: [string, string][] = [
    ["작년 무릎 부상", "작년 무릎 [건강정보]"],
    ["천식이 있어요", "[건강정보]이 있어요"],
    ["ADHD 진단", "[건강정보] [건강정보]"],
    ["골절 후 재활", "[건강정보] 후 재활"],
    ["알레르기 약 복용 중", "[건강정보] [건강정보] 중"],
  ];
  it.each(cases)("%s", (input, want) => expect(redact(input).text).toBe(want));
  it("끄면 남긴다 (건강정보 판별용 호출)", () => {
    expect(redact("무릎 부상", [], { maskHealth: false }).text).toBe("무릎 부상");
  });
});

describe("redact: 그대로 두는 것", () => {
  const cases = ["12/20 10시 1:2 강습", "키 140, 발 220", "스키 120 부츠 230", "200,000원", "2026-12-06"];
  it.each(cases)("%s", (input) => expect(redact(input).text).toBe(input));
});

describe("hasContact", () => {
  it("남은 연락처를 찾는다", () => {
    expect(hasContact("010-1111-2222")).toBe(true);
    expect(hasContact(redact("010-1111-2222 kim@a.com").text)).toBe(false);
    expect(hasContact("12/20 10:00")).toBe(false);
  });
});
