import { describe, expect, it } from "vitest";
import { INSTRUCTOR_TEMPLATE, checkInstructorRows } from "./instructors";

const head = INSTRUCTOR_TEMPLATE[0];

describe("강사 CSV 확인", () => {
  it("양식", () => {
    expect(head).toEqual(["이름", "휴대폰", "이메일"]);
    expect(INSTRUCTOR_TEMPLATE[1][0]).toMatch(/^\[테스트\]/);
  });
  it("휴대폰이나 이메일 중 하나는 있어야 한다", () => {
    const r = checkInstructorRows([head, ["김강사", "", ""], ["이강사", "010-1111-2222", ""], ["박강사", "", "Park@Test.com"]]);
    expect(r.rows[0].errors[0]).toContain("휴대폰이나 이메일");
    expect(r.rows[1].data).toEqual({ name: "이강사", phone: "010-1111-2222", email: null });
    expect(r.rows[2].data).toEqual({ name: "박강사", phone: null, email: "park@test.com" });
  });
  it("형식 오류", () => {
    const r = checkInstructorRows([head, ["김", "12", ""], ["이", "", "not-email"]]);
    expect(r.rows[0].errors[0]).toContain("휴대폰");
    expect(r.rows[1].errors[0]).toContain("이메일");
  });
  it("파일 안 중복은 건너뛴다", () => {
    const r = checkInstructorRows([head, ["김", "01011112222", ""], ["김2", "010-1111-2222", ""], ["박", "", "a@t.com"], ["박2", "", "A@t.com"]]);
    expect(r.rows.map((x) => x.skip ?? null)).toEqual([null, "파일 안에서 2행과 같은 사람", null, "파일 안에서 4행과 같은 사람"]);
  });
  it("300명까지", () => {
    expect(checkInstructorRows([head, ...Array.from({ length: 301 }, (_, i) => [`강사${i}`, "", `a${i}@t.com`])]).fileError).toContain("300");
  });
});
