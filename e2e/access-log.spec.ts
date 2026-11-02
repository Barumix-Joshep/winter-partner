import { expect, test } from "@playwright/test";
import { as } from "./helpers";

// 접속 기록: 연락처 열람·엑셀 다운로드가 남고, 자기 샵 기록만 보인다. 본사는 전체를 본다.
test("손님 카드 열람과 엑셀 다운로드가 접속 기록에 남는다", async ({ browser }) => {
  const shop = await as(browser, "shop1@winter.test");
  await shop.goto("/shop/customers?id=d0000000-0000-0000-0000-000000000002");
  await expect(shop.getByRole("heading", { name: "손님 둘" })).toBeVisible();
  const res = await shop.request.get("/shop/settlements/export?month=2026-12");
  expect(res.status()).toBe(200);

  await shop.goto("/shop/access-logs");
  await expect(shop.getByRole("cell", { name: "손님 연락처 열람" }).first()).toBeVisible();
  await expect(shop.getByRole("cell", { name: "정산 엑셀 다운로드" }).first()).toBeVisible();
  await expect(shop.getByRole("cell", { name: "최렌탈" }).first()).toBeVisible();

  const other = await as(browser, "shop2@winter.test");
  await other.goto("/shop/access-logs");
  await expect(other.getByRole("cell", { name: "최렌탈" })).toHaveCount(0);

  const admin = await as(browser, "admin@winter.test");
  await admin.goto("/admin/access-logs");
  await expect(admin.getByRole("cell", { name: "하이원 스노우렌탈" }).first()).toBeVisible();
});
