// 로그인 세션 쿠키 속성 (보안 9). @supabase/ssr 기본값은 httpOnly: false라 스크립트가 토큰을 읽을 수 있다.
// 이 앱은 브라우저에서 Supabase를 직접 부르지 않으므로(서버 액션·서버 컴포넌트·proxy만) HttpOnly로 둔다.
// Secure는 운영 빌드에서(브라우저는 http://localhost의 Secure 쿠키도 받는다 — E2E 운영 빌드).
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
} as const;
