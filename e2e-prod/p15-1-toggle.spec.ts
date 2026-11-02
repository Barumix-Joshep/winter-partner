import { expect, test } from "@playwright/test";
import { as } from "./helpers";

// P15-1 샵 설정 반영: 끄면 붙여넣기 칸이 사라지고(수동 흐름), 켜면 다시 보인다. AI 호출 없음.
test("샵이 AI를 끄고 켜기", async ({ browser }) => {
  const shop = await as(browser, "test-rental");
  await shop.goto("/shop/ai");
  await shop.getByRole("button", { name: "강습 접수 자동 입력 끄기" }).click();
  await expect(shop.getByRole("button", { name: "강습 접수 자동 입력 켜기" })).toBeVisible();
  await shop.goto("/shop/jobs/new");
  await expect(shop.getByLabel("날짜", { exact: true })).toBeVisible();
  await expect(shop.getByLabel("문자·카톡 붙여넣기")).toHaveCount(0);
  await shop.goto("/shop/ai");
  await shop.getByRole("button", { name: "강습 접수 자동 입력 켜기" }).click();
  await shop.goto("/shop/jobs/new");
  await expect(shop.getByLabel("문자·카톡 붙여넣기")).toBeVisible();
});
