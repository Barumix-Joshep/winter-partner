// P19-3 보안 헤더와 CSP(먼저 Report-Only): 주요 화면을 열어 CSP 위반이 하나도 없어야 강제로 바꿀 수 있다.
// 오류 화면: 없는 강습 주소는 안내 화면, 홈 버튼.
import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

const SCREENS: Record<string, string[]> = {
  "shop1@winter.test": ["/shop", "/shop/jobs", "/shop/jobs/new", "/shop/customers", "/shop/team", "/shop/settlements", "/shop/register-qr", "/help", "/notifications"],
  "kim@winter.test": ["/instructor", "/instructor/bids", "/instructor/schedule", "/instructor/pay", "/instructor/profile"],
  "admin@winter.test": ["/admin", "/admin/ops"],
};

function watchCsp(page: Page) {
  const hits: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Content-Security-Policy/i.test(m.text())) hits.push(`${page.url()} ${m.text().slice(0, 200)}`);
  });
  return hits;
}

test("보안 헤더가 모든 응답에 붙는다", async ({ request }) => {
  const res = await request.get("/login");
  const h = res.headers();
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["permissions-policy"]).toContain("camera=()");
  const csp = h["content-security-policy"] ?? h["content-security-policy-report-only"];
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
});

for (const [email, paths] of Object.entries(SCREENS)) {
  test(`CSP 위반 없음: ${email.split("@")[0]} 화면 ${paths.length}개`, async ({ page }) => {
    const hits = watchCsp(page);
    await login(page, email);
    for (const p of paths) {
      await page.goto(p);
      await page.locator("main").first().waitFor();
      await page.waitForLoadState("networkidle").catch(() => {});
    }
    expect(hits).toEqual([]);
  });
}

test("없는 화면은 안내와 홈 버튼 (오류 화면)", async ({ page }) => {
  await login(page, "shop1@winter.test");
  await page.goto("/shop/jobs/00000000-0000-0000-0000-000000000000");
  await expect(page.getByText("찾는 화면이 없습니다")).toBeVisible();
  await page.getByRole("link", { name: "홈으로" }).click();
  await expect(page).toHaveURL(/\/shop/);
});
