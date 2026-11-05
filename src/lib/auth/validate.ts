// 로그인·가입 폼 검증 (서버 액션과 테스트에서 함께 쓴다)

export type SignupRole = "shop_admin" | "instructor";

// E: 데이터에는 없지만 오류로 알릴 필드 (예: 동의 체크)
type Result<T, E extends string = never> = { ok: true; data: T } | { ok: false; errors: Partial<Record<keyof T | E, string>> };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIGNUP_ROLES: readonly SignupRole[] = ["shop_admin", "instructor"];
const AGREE_REQUIRED = "이용약관과 개인정보 처리방침에 동의해 주세요.";

// 비밀번호 규칙: 8자 이상 + 영문·숫자 포함. Supabase Auth 설정(supabase/config.toml minimum_password_length·password_requirements)과 같게 둔다.
// 문제가 없으면 null, 있으면 안내 문구.
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return "비밀번호에 영문과 숫자를 함께 넣어 주세요.";
  return null;
}

function text(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

export function parseLogin(fd: FormData): Result<{ email: string; password: string }> {
  const email = text(fd, "email").trim().toLowerCase();
  const password = text(fd, "password");
  const errors: { email?: string; password?: string } = {};
  if (!EMAIL.test(email)) errors.email = "이메일 형식을 확인해 주세요.";
  if (!password) errors.password = "비밀번호를 입력해 주세요.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data: { email, password } };
}

export function parseResetRequest(fd: FormData): Result<{ email: string }> {
  const email = text(fd, "email").trim().toLowerCase();
  return EMAIL.test(email) ? { ok: true, data: { email } } : { ok: false, errors: { email: "이메일 형식을 확인해 주세요." } };
}

export function parseSignup(
  fd: FormData,
): Result<{ name: string; email: string; password: string; role: SignupRole }, "agree"> {
  const name = text(fd, "name").trim();
  const email = text(fd, "email").trim().toLowerCase();
  const password = text(fd, "password");
  const role = text(fd, "role") as SignupRole;
  const errors: { name?: string; email?: string; password?: string; role?: string; agree?: string } = {};
  if (!name) errors.name = "이름을 입력해 주세요.";
  if (!EMAIL.test(email)) errors.email = "이메일 형식을 확인해 주세요.";
  if (fd.get("agree") !== "on") errors.agree = AGREE_REQUIRED;
  const weak = passwordProblem(password);
  if (weak) errors.password = weak;
  // 플랫폼 관리자는 가입으로 만들 수 없다 (DB 트리거도 막는다)
  if (!SIGNUP_ROLES.includes(role)) errors.role = "샵 관리자 또는 강사를 골라 주세요.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data: { name, email, password, role } };
}

// OAuth(카카오) 첫 로그인 때 역할 고르기
export function parseOnboarding(fd: FormData): Result<{ name: string; role: SignupRole }, "agree"> {
  const name = text(fd, "name").trim();
  const role = text(fd, "role") as SignupRole;
  const errors: { name?: string; role?: string; agree?: string } = {};
  if (fd.get("agree") !== "on") errors.agree = AGREE_REQUIRED;
  if (!name) errors.name = "이름을 입력해 주세요.";
  if (!SIGNUP_ROLES.includes(role)) errors.role = "샵 관리자 또는 강사를 골라 주세요.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data: { name, role } };
}

// 로그인 뒤 돌아갈 경로. 외부 주소로 보내는 열린 리다이렉트를 막는다.
export function safeNext(next: string | null | undefined) {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}

const MESSAGES: Record<string, string> = {
  "Invalid login credentials": "이메일 또는 비밀번호가 맞지 않습니다.",
  "Email not confirmed": "이메일 인증을 먼저 완료해 주세요.",
  "User already registered": "이미 가입된 이메일입니다.",
};

export function authErrorMessage(message: string) {
  // 서버 비밀번호 규칙(앱 검사를 거치지 않은 경우의 안전망)
  if (/^Password should contain at least one character/.test(message)) return "비밀번호에 영문과 숫자를 함께 넣어 주세요.";
  if (/^Password should be at least \d+ characters/.test(message)) return "비밀번호는 8자 이상이어야 합니다.";
  return MESSAGES[message] ?? "잠시 후 다시 시도해 주세요.";
}
