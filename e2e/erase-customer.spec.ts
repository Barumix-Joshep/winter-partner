import { expect, test } from "@playwright/test";
import { as } from "./helpers";

// 손님 삭제 요청: 확인 단계 뒤 즉시 익명화 (되돌릴 수 없음)
test("삭제 요청을 처리하면 손님이 익명화되고 목록에서 빠진다", async ({ browser }) => {
  const shop = await as(browser, "shop1@winter.test");
  await shop.goto("/shop/customers?new=1");
  await shop.getByLabel("이름", { exact: true }).fill("E2E 삭제손님");
  await shop.getByLabel("연락처", { exact: true }).fill("010-8000-0001");
  await shop.getByRole("button", { name: "손님 등록" }).click();
  await expect(shop.getByRole("heading", { name: "E2E 삭제손님" })).toBeVisible();

  await shop.getByRole("button", { name: "손님 정보 삭제 요청 처리…" }).click();
  await expect(shop.getByText("되돌릴 수 없습니다.")).toBeVisible();
  await shop.getByLabel(/익명화.*입력해 주세요/).fill("삭제");
  await shop.getByRole("button", { name: "익명화", exact: true }).click();
  await expect(shop.getByRole("alert").filter({ hasText: "확인 문구" })).toBeVisible();

  await shop.getByLabel(/익명화.*입력해 주세요/).fill("익명화");
  await shop.getByRole("button", { name: "익명화", exact: true }).click();
  await expect(shop.getByText(/익명화된 손님입니다/)).toBeVisible();
  await expect(shop.getByText("010-8000-0001")).toHaveCount(0);

  await shop.goto("/shop/customers?q=E2E");
  await expect(shop.getByText("E2E 삭제손님")).toHaveCount(0);
});
