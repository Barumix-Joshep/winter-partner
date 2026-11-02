import { expect, test } from "@playwright/test";
import { as } from "./helpers";
import { setAiFeatures } from "./ai";

// A3 입찰 선정 보조 (가짜 모델): 추천·이유를 보여 주고, 추천대로 선택은 선정 버튼으로 옮길 뿐 확정하지 않는다.
test.beforeAll(async () => setAiFeatures(true, ["bid_assist"]));
test.afterAll(async () => setAiFeatures(false, ["bid_assist"]));

test("입찰 추천을 보고 선정 버튼으로 이동", async ({ browser }) => {
  const shop = await as(browser, "shop2@winter.test");
  await shop.goto("/shop/jobs/e0000000-0000-0000-0000-000000000003");
  await shop.getByRole("button", { name: "AI 추천 보기" }).click();
  await expect(shop.getByRole("status")).toContainText("추천: 이보드");
  await shop.getByRole("button", { name: "추천대로 선택" }).click();
  const selectBtn = shop.getByRole("listitem").filter({ hasText: "이보드" }).getByRole("button", { name: "선정" });
  await expect(selectBtn).toBeFocused();
  // 아직 선정되지 않았다 (확정은 사장님이)
  await expect(shop.getByText(/^배정:/)).toHaveCount(0);
});
