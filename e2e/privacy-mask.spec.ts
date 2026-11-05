// 보안 11(개인정보): 손님 목록에는 연락처 가운데를 가리고, 전체 번호는 손님 상세(열람 기록이 남는 곳)에서만 보인다.
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("손님 목록은 연락처를 가리고, 상세에서만 전체 번호가 보인다", async ({ page }) => {
  await login(page, "shop1@winter.test");
  await page.goto("/shop/customers");
  await expect(page.getByText("010-****-1001").first()).toBeVisible();
  await expect(page.getByText("010-0000-1001")).toHaveCount(0);
  // 번호로 찾기는 그대로 된다
  await page.goto(`/shop/customers?q=${encodeURIComponent("010-0000-1001")}`);
  await expect(page.getByText("010-****-1001").first()).toBeVisible();
});
