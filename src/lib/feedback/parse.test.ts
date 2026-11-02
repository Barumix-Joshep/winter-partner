import { describe, expect, it } from "vitest";
import { parseFeedback } from "./parse";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  Object.entries(o).forEach(([k, v]) => f.set(k, v));
  return f;
};

describe("의견 보내기", () => {
  it("내용·화면 주소·선택 연락처", () => {
    expect(parseFeedback(fd({ body: " 버튼이 안 눌려요 ", path: "/shop/jobs/new", contact: "" }))).toEqual({
      ok: true,
      data: { body: "버튼이 안 눌려요", path: "/shop/jobs/new", contact: null, masked: false },
    });
  });
  it("본문의 전화번호·이메일은 가린다 (손님 정보가 섞이지 않게)", () => {
    const r = parseFeedback(fd({ body: "손님 010-1234-5678 kim@a.com 등록이 안 됨", path: "/shop/customers" }));
    expect(r.ok && r.data.body).toBe("손님 [전화] [이메일] 등록이 안 됨");
    expect(r.ok && r.data.masked).toBe(true);
  });
  it("연락처 칸은 본인 연락처라 그대로 둔다", () => {
    const r = parseFeedback(fd({ body: "a", path: "/", contact: "010-0000-1111" }));
    expect(r.ok && r.data.contact).toBe("010-0000-1111");
  });
  it("빈 내용·너무 긴 내용", () => {
    expect(parseFeedback(fd({ body: "  ", path: "/" })).ok).toBe(false);
    expect(parseFeedback(fd({ body: "a".repeat(2001), path: "/" })).ok).toBe(false);
  });
  it("화면 주소는 경로만 (쿼리·외부 주소 제거)", () => {
    const r = parseFeedback(fd({ body: "a", path: "https://evil.example/x?token=abc" }));
    expect(r.ok && r.data.path).toBe("/");
    const r2 = parseFeedback(fd({ body: "a", path: "/consent/abc?x=1" }));
    expect(r2.ok && r2.data.path).toBe("/consent/abc");
  });
});
