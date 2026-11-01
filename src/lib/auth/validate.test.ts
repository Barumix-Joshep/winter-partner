import { describe, expect, it } from "vitest";
import { authErrorMessage, parseLogin, parseSignup, safeNext } from "./validate";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("parseLogin", () => {
  it("이메일과 비밀번호를 다듬어 돌려준다", () => {
    expect(parseLogin(form({ email: "  Shop1@Winter.test ", password: "winter1234" }))).toEqual({
      ok: true,
      data: { email: "shop1@winter.test", password: "winter1234" },
    });
  });

  it("빈 값과 잘못된 이메일을 막는다", () => {
    const r = parseLogin(form({ email: "nope", password: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.email).toBeDefined();
      expect(r.errors.password).toBeDefined();
    }
  });
});

describe("parseSignup", () => {
  const base = { name: "김스키", email: "kim@winter.test", password: "winter1234", role: "instructor" };

  it("강사·샵 관리자 가입을 받는다", () => {
    expect(parseSignup(form(base))).toEqual({ ok: true, data: base });
    expect(parseSignup(form({ ...base, role: "shop_admin" })).ok).toBe(true);
  });

  it("플랫폼 관리자로는 가입할 수 없다", () => {
    const r = parseSignup(form({ ...base, role: "platform_admin" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.role).toBeDefined();
  });

  it("비밀번호는 8자 이상, 이름은 필수", () => {
    const r = parseSignup(form({ ...base, name: " ", password: "short" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.name).toBeDefined();
      expect(r.errors.password).toBeDefined();
    }
  });
});

describe("safeNext", () => {
  it("같은 사이트 경로만 허용한다", () => {
    expect(safeNext("/jobs/1")).toBe("/jobs/1");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
});

describe("authErrorMessage", () => {
  it("Supabase 오류를 한국어로 바꾼다", () => {
    expect(authErrorMessage("Invalid login credentials")).toBe("이메일 또는 비밀번호가 맞지 않습니다.");
    expect(authErrorMessage("Email not confirmed")).toBe("이메일 인증을 먼저 완료해 주세요.");
    expect(authErrorMessage("User already registered")).toBe("이미 가입된 이메일입니다.");
    expect(authErrorMessage("something else")).toBe("잠시 후 다시 시도해 주세요.");
  });
});
