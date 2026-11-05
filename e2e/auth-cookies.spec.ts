// 보안 9(쿠키): 로그인 세션 쿠키는 HttpOnly(스크립트가 못 읽음)·SameSite=Lax, 운영 빌드에서는 Secure.
// 이 앱은 브라우저에서 Supabase를 직접 부르지 않으므로(서버 액션·서버 컴포넌트만) 스크립트가 토큰을 읽을 필요가 없다.
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("세션 쿠키는 스크립트가 읽지 못하고 다른 사이트 요청에 실리지 않는다", async ({ page, context }) => {
  await login(page, "shop1@winter.test");
  const auth = (await context.cookies()).filter((c) => /^sb-.*-auth-token/.test(c.name));
  expect(auth.length).toBeGreaterThan(0);
  for (const c of auth) {
    expect(c.httpOnly, c.name).toBe(true);
    expect(c.sameSite, c.name).toBe("Lax");
    if (process.env.E2E_SERVER === "start") expect(c.secure, c.name).toBe(true);
  }
  expect(await page.evaluate(() => document.cookie)).not.toContain("auth-token");
  // 쿠키를 못 읽어도 화면은 그대로 동작한다 (세션 갱신은 서버가)
  await page.goto("/shop");
  await expect(page).toHaveURL(/\/shop$/);
});
