import { describe, expect, it } from "vitest";
import { authErrorMessage, parseLogin, parseOnboarding, parseSignup, passwordProblem, safeNext, parseResetRequest } from "./validate";

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
  const base = { name: "김스키", email: "kim@winter.test", password: "winter1234", role: "instructor", agree: "on" };

  it("강사·샵 관리자 가입을 받는다", () => {
    expect(parseSignup(form(base))).toEqual({ ok: true, data: { name: "김스키", email: "kim@winter.test", password: "winter1234", role: "instructor" } });
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

describe("가입 동의", () => {
  it("약관·개인정보 동의 없이는 가입할 수 없다", () => {
    const r = parseSignup(form({ name: "김스키", email: "kim@winter.test", password: "winter1234", role: "instructor" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.agree).toBeDefined();
  });

  it("역할 선택(카카오 첫 로그인)도 동의가 필요하다", () => {
    expect(parseOnboarding(form({ name: "김스키", role: "instructor" })).ok).toBe(false);
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

describe("parseOnboarding", () => {
  it("이름과 역할을 받는다", () => {
    expect(parseOnboarding(form({ name: " 김스키 ", role: "instructor", agree: "on" }))).toEqual({
      ok: true,
      data: { name: "김스키", role: "instructor" },
    });
  });

  it("플랫폼 관리자는 고를 수 없다", () => {
    expect(parseOnboarding(form({ name: "해커", role: "platform_admin", agree: "on" })).ok).toBe(false);
  });
});

describe("parseResetRequest", () => {
  it("이메일을 소문자로 다듬는다", () => {
    const fd = new FormData();
    fd.set("email", " Kim@Test.COM ");
    expect(parseResetRequest(fd)).toEqual({ ok: true, data: { email: "kim@test.com" } });
  });
  it("형식이 틀리면 오류", () => {
    const fd = new FormData();
    fd.set("email", "kim");
    expect(parseResetRequest(fd).ok).toBe(false);
  });
});

// 보안 5(인증 설정): 비밀번호는 8자 이상 + 영문·숫자 포함. Supabase 설정(minimum_password_length=8, letters_digits)과 같은 규칙.
describe("passwordProblem", () => {
  it("8자 이상이고 영문과 숫자가 모두 있으면 통과", () => {
    expect(passwordProblem("winter1234")).toBeNull();
    expect(passwordProblem("A1b2c3d4")).toBeNull();
  });
  it("짧거나 한 종류만 있으면 안내 문구", () => {
    expect(passwordProblem("abc123")).toMatch(/8자/);
    expect(passwordProblem("abcdefgh")).toMatch(/영문과 숫자/);
    expect(passwordProblem("12345678")).toMatch(/영문과 숫자/);
  });
  it("가입 검증도 같은 규칙", () => {
    const r = parseSignup(form({ name: "김스키", email: "kim@winter.test", password: "12345678", role: "instructor", agree: "on" }));
    expect(r.ok).toBe(false);
  });
  it("Supabase의 약한 비밀번호 오류를 한국어로", () => {
    expect(authErrorMessage("Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789.")).toMatch(/영문과 숫자/);
    expect(authErrorMessage("Password should be at least 8 characters.")).toMatch(/8자/);
  });
  it("서버 규칙이 앱보다 엄격하면 서버가 요구한 글자 종류를 그대로 알려 준다", () => {
    const sym = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~";
    expect(
      authErrorMessage(`Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789.`),
    ).toBe("비밀번호에 영문 소문자, 영문 대문자, 숫자를 모두 넣어 주세요.");
    expect(
      authErrorMessage(`Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789, ${sym}.`),
    ).toBe("비밀번호에 영문 소문자, 영문 대문자, 숫자, 특수문자(!@# 등)를 모두 넣어 주세요.");
  });
});
