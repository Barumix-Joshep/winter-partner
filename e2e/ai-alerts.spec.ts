import { expect, test } from "@playwright/test";
import { admin, as } from "./helpers";
import { setAiFeatures } from "./ai";

// D3 규칙 기반 이상 패턴 + 강사 활동 요약 (본사, 가짜 모델)
test.beforeAll(async () => setAiFeatures(true, ["admin_query"]));
test.afterAll(async () => setAiFeatures(false, ["admin_query"]));

test("일방 취소가 잦은 강사가 신호로 뜨고 활동을 요약한다", async ({ browser }) => {
  await admin().from("instructor_penalties").insert([
    { instructor_id: "c0000000-0000-0000-0000-000000000022", reason: "E2E 취소 1", points: 1 },
    { instructor_id: "c0000000-0000-0000-0000-000000000022", reason: "E2E 취소 2", points: 1 },
  ]);
  const boss = await as(browser, "admin@winter.test");
  await boss.goto("/admin/alerts");
  const row = boss.getByRole("listitem").filter({ hasText: "이보드" }).filter({ hasText: "일방 취소" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "최근 활동 요약 (AI)" }).click();
  await expect(row.getByRole("status")).toContainText("일방 취소가 여러 번");

  const shop = await as(browser, "shop1@winter.test");
  await shop.goto("/admin/alerts");
  await expect(shop).not.toHaveURL(/\/admin/);
});
