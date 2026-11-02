import { expect, test } from "@playwright/test";
import { as } from "./helpers";

// P16-5 사용 안내: 로그인 없이 열리고, 샵·강사 각각 5가지, 그림이 뜬다. 샵 화면에서 들어갈 수 있다.
test("사용 안내", async ({ page, browser }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/help");
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(5);
  await expect(page.getByRole("heading", { name: "2. 강습 등록하기" })).toBeVisible();
  const img = page.getByRole("img", { name: /오늘 일정 화면/ });
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0); // 그림이 다 받아질 때까지 기다린다
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

  await page.getByRole("link", { name: "강사용" }).click();
  await expect(page.getByRole("heading", { name: "2. 공고에 입찰하기" })).toBeVisible();

  const shop = await as(browser, "shop1@winter.test");
  await shop.getByRole("link", { name: "사용 안내" }).first().click();
  await expect(shop).toHaveURL(/\/help\?for=shop/);
});
