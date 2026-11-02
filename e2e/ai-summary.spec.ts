import { expect, test } from "@playwright/test";
import { admin, as } from "./helpers";
import { setAiFeatures } from "./ai";

// A4 손님 카드 요약 (가짜 모델): 열면 요약, 광고 동의 없으면 연락 문구 없음, 기록이 그대로면 다시 만들지 않는다
test.beforeAll(async () => setAiFeatures(true, ["customer_summary"]));
test.afterAll(async () => setAiFeatures(false, ["customer_summary"]));

const CUSTOMER = "d0000000-0000-0000-0000-000000000003"; // 손님 셋 (shop2, 강습 이력 있음, 광고 동의 없음 — 다른 테스트가 동의를 넣지 않는 손님)

test("손님 카드 요약과 캐시", async ({ browser }) => {
  const shop = await as(browser, "shop2@winter.test");
  await shop.goto(`/shop/customers?id=${CUSTOMER}`);
  const box = shop.getByRole("status").filter({ hasText: "다음 강습 제안" });
  await expect(box).toContainText("연속 턴");
  await expect(box).toContainText("광고 수신 동의가 유효한 손님에게만");

  const db = admin();
  const count = async () => (await db.from("ai_usage").select("id", { count: "exact", head: true }).eq("feature", "customer_summary")).count ?? 0;
  const before = await count();
  await shop.reload();
  await expect(shop.getByRole("status").filter({ hasText: "다음 강습 제안" })).toBeVisible();
  expect(await count()).toBe(before); // 기록이 그대로면 다시 부르지 않는다
});
