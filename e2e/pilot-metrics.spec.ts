import { expect, test } from "@playwright/test";
import { admin, as } from "./helpers";

// P16-7 시범 운영 지표: 샵별 집계만, 개인정보 없음, [테스트] 샵은 기본 제외
test("본사 시범 운영 지표", async ({ browser }) => {
  await admin().from("shops").insert({ name: "[테스트] 지표 확인 샵", status: "approved" });
  const boss = await as(browser, "admin@winter.test");
  await boss.goto("/admin");
  await boss.getByRole("link", { name: "시범 운영 지표" }).click();
  const row = boss.getByRole("row").filter({ hasText: "하이원 스노우렌탈" });
  await expect(row).toBeVisible();
  await expect(row).toContainText(/강습 \d+건/);
  await expect(boss.getByRole("row").filter({ hasText: "[테스트] 지표 확인 샵" })).toHaveCount(0);

  const text = await boss.locator("main").innerText();
  for (const pii of ["손님 둘", "010-0000-1002", "김스키", "kim@winter.test"]) expect(text).not.toContain(pii);

  await boss.getByRole("link", { name: "[테스트] 샵 포함" }).click();
  await expect(boss.getByRole("row").filter({ hasText: "[테스트] 지표 확인 샵" })).toContainText("아직");

  const shop = await as(browser, "shop1@winter.test");
  await shop.goto("/admin/pilot");
  await expect(shop).not.toHaveURL(/\/admin/);
});
