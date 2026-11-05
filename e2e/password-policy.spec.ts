// 보안 5(인증 설정): 비밀번호 규칙(8자 이상, 영문·숫자)은 앱 폼만이 아니라 Supabase Auth 서버도 강제한다.
// 공개 키(anon)로 Auth API를 바로 불러도 약한 비밀번호로는 가입하지 못한다 (supabase/config.toml과 운영 대시보드 설정을 같게 둔다).
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "./local-env";

const anon = () => {
  const { url, anonKey } = localSupabase();
  return createClient(url, anonKey, { auth: { persistSession: false } });
};

for (const [password, why] of [
  ["abc123", "6자"],
  ["abcdefgh", "숫자 없음"],
  ["12345678", "영문 없음"],
] as const) {
  test(`앱을 거치지 않고 Auth API로 바로 가입해도 약한 비밀번호(${why})는 거부된다`, async () => {
    const { data, error } = await anon().auth.signUp({ email: `weak-${Date.now()}-${why.length}@winter.test`, password });
    expect(data.user).toBeNull();
    expect(error?.code).toBe("weak_password");
  });
}

test("가입 화면도 같은 규칙을 한국어로 안내한다", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("tab", { name: "가입" }).click();
  await page.getByLabel("이름").fill("[테스트] 약한비번");
  await page.getByLabel("이메일").fill(`weak-ui-${Date.now()}@winter.test`);
  await page.getByLabel(/^비밀번호/).fill("12345678");
  await page.getByLabel(/동의/).check();
  await page.getByText("강사", { exact: true }).click();
  await page.getByRole("button", { name: "가입하기" }).click();
  await expect(page.getByText("비밀번호에 영문과 숫자를 함께 넣어 주세요.")).toBeVisible();
});
