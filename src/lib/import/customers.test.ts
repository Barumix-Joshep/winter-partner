import { describe, expect, it } from "vitest";
import { CUSTOMER_TEMPLATE, checkCustomerRows } from "./customers";

const head = CUSTOMER_TEMPLATE[0];
const row = (o: Partial<Record<string, string>>) => head.map((h) => o[h] ?? "");

describe("손님 CSV 확인", () => {
  it("양식 첫 줄은 열 이름, 둘째 줄은 [테스트] 예시", () => {
    expect(head).toEqual(["이름", "휴대폰", "출생연도", "보호자 이름", "보호자 휴대폰", "레벨", "장비 사이즈", "태그", "메모"]);
    expect(CUSTOMER_TEMPLATE[1][0]).toMatch(/^\[테스트\]/);
    expect(CUSTOMER_TEMPLATE[1][1]).toMatch(/^010-0000-/);
  });

  it("정상 행은 번호를 다듬어 등록 대상", () => {
    const r = checkCustomerRows([head, row({ 이름: "김손님", 휴대폰: "01011112222", 태그: "#가족 #재방문" })], new Set(), 2026);
    expect(r.rows[0]).toMatchObject({ line: 2, errors: [], data: { name: "김손님", phone: "010-1111-2222", tags: ["가족", "재방문"] } });
    expect(r.okCount).toBe(1);
  });

  it("연락처 형식·이름 빠짐·14세 미만 보호자 없음은 오류 행", () => {
    const r = checkCustomerRows(
      [head, row({ 이름: "김", 휴대폰: "1234" }), row({ 휴대폰: "010-1111-3333" }), row({ 이름: "어린이", 출생연도: "2020" })],
      new Set(),
      2026,
    );
    expect(r.rows.map((x) => x.errors.length > 0)).toEqual([true, true, true]);
    expect(r.rows[0].errors[0]).toContain("연락처");
    expect(r.rows[2].errors.join(" ")).toContain("보호자");
    expect(r.okCount).toBe(0);
  });

  it("파일 안 중복과 이미 등록된 연락처는 건너뛴다", () => {
    const r = checkCustomerRows(
      [head, row({ 이름: "가", 휴대폰: "010-2222-3333" }), row({ 이름: "나", 휴대폰: "01022223333" }), row({ 이름: "다", 휴대폰: "010-4444-5555" })],
      new Set(["010-4444-5555"]),
      2026,
    );
    expect(r.rows.map((x) => x.skip ?? null)).toEqual([null, "파일 안에서 2행과 같은 연락처", "이미 등록된 연락처"]);
    expect(r.okCount).toBe(1);
  });

  it("메모에 건강 정보 단어가 있으면 오류 (민감정보는 따로 동의가 필요)", () => {
    const r = checkCustomerRows([head, row({ 이름: "가", 메모: "무릎 수술 이력" })], new Set(), 2026);
    expect(r.rows[0].errors.join(" ")).toContain("건강");
  });

  it("열 순서가 달라도, 영어 열 이름도 읽는다", () => {
    const r = checkCustomerRows([["phone", "name"], ["010-5555-6666", "이손님"]], new Set(), 2026);
    expect(r.rows[0].data).toMatchObject({ name: "이손님", phone: "010-5555-6666" });
  });

  it("이름 열이 없으면 파일 오류", () => {
    expect(checkCustomerRows([["휴대폰"], ["010"]], new Set(), 2026).fileError).toContain("이름");
  });

  it("500행까지", () => {
    const many = [head, ...Array.from({ length: 501 }, (_, i) => row({ 이름: `손님${i}` }))];
    expect(checkCustomerRows(many, new Set(), 2026).fileError).toContain("500");
  });
});
