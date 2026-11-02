import { expect, test } from "@playwright/test";
import { admin, PASSWORD } from "./helpers";
import { LIMITS, limitKey, type LimitName } from "../src/lib/ops/limits";

// P16-3 요청 횟수 제한(한도 초과 안내)과 비밀번호 재설정
const MAILPIT = "http://127.0.0.1:54324";

// 화면으로 수십 번 시도하는 대신, 같은 키로 한도 직전까지 미리 센다
async function fill(name: LimitName, subject: string, times: number) {
  const l = LIMITS[name];
  for (let i = 0; i < times; i++) {
    await admin().rpc("public_rate_limit", { p_key: limitKey(name, subject), p_max: l.max, p_window_seconds: l.windowSeconds });
  }
}

async function resetLink(email: string) {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const list = (await res.json()) as { messages: { ID: string }[] };
    if (list.messages?.length) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${list.messages[0].ID}`)).json()) as { HTML: string; Text: string };
      const m = (msg.HTML || msg.Text).match(/href="([^"]+)"/) ?? (msg.Text ?? "").match(/(http\S+verify\S+)/);
      if (m) return m[1].replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("재설정 메일이 오지 않았습니다");
}

test("같은 계정으로 로그인을 10번 틀리면 10분 동안 막고 안내한다", async ({ page }) => {
  const email = `rl-${Date.now()}@winter.test`;
  await fill("login_account", email, LIMITS.login_account.max - 1);
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill("wrong-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "이메일 또는 비밀번호가 맞지 않습니다." })).toBeVisible(); // 10번째 실패까지는 평소 안내
  await page.getByLabel("이메일").fill(email); // 액션 뒤 폼이 비워진다
  await page.getByLabel("비밀번호").fill("wrong-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "요청이 너무 많습니다. 10분 뒤에 다시 시도해 주세요." })).toBeVisible();
});

test("비밀번호 재설정 메일 → 새 비밀번호로 로그인, 같은 계정 재요청은 시간당 3번", async ({ page }) => {
  const email = `reset-${Date.now()}@winter.test`;
  const { error } = await admin().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { role: "instructor", name: "재설정강사", agreed: true } });
  expect(error).toBeNull();

  await page.goto("/login");
  await page.getByRole("link", { name: "비밀번호를 잊으셨나요?" }).click();
  await page.getByLabel("가입한 이메일").fill(email);
  await page.getByRole("button", { name: "재설정 메일 받기" }).click();
  await expect(page.getByText("비밀번호 재설정 메일을 보냈습니다")).toBeVisible();

  await page.goto(await resetLink(email));
  await expect(page).toHaveURL(/\/login\/reset/);
  await page.getByLabel("새 비밀번호").fill("newpass-1234");
  await page.getByLabel("한 번 더").fill("newpass-1234");
  await page.getByRole("button", { name: "새 비밀번호 저장" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));

  const fresh = await page.context().browser()!.newPage();
  await fresh.goto("/login");
  await fresh.getByLabel("이메일").fill(email);
  await fresh.getByLabel("비밀번호").fill("newpass-1234");
  await fresh.getByRole("button", { name: "로그인" }).click();
  await fresh.waitForURL((u) => !u.pathname.startsWith("/login"));

  await fill("reset_account", email, LIMITS.reset_account.max - 1); // 이미 1번 + 2번 = 3번
  await fresh.context().clearCookies();
  await fresh.goto("/login/forgot");
  await fresh.getByLabel("가입한 이메일").fill(email);
  await fresh.getByRole("button", { name: "재설정 메일 받기" }).click();
  await expect(fresh.getByRole("alert").filter({ hasText: "요청이 너무 많습니다. 1시간 뒤에 다시 시도해 주세요." })).toBeVisible();
});

test("동의 링크를 같은 IP에서 너무 많이 열면 안내 화면", async ({ browser }) => {
  const ip = "203.0.113.77";
  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": ip } });
  const page = await ctx.newPage();
  await fill("link_view_ip", ip, LIMITS.link_view_ip.max);
  await page.goto("/consent/not-a-real-token");
  await expect(page.getByRole("alert").filter({ hasText: "잠시 쉬었다가 다시 열어 주세요" })).toBeVisible();
  await ctx.close();
});
