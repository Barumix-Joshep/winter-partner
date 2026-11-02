import { expect, test } from "@playwright/test";
import { as } from "./helpers";
import { setAiFeatures } from "./ai";

// E 관리자 질의 (가짜 모델): 질문 → 정해진 집계 하나. AI를 꺼도 목록에서 직접 고른다.
test.afterAll(async () => setAiFeatures(false, ["admin_query"]));

test("질문으로 집계를 고르고, AI 없이도 직접 고른다", async ({ browser }) => {
  const boss = await as(browser, "admin@winter.test");
  await boss.goto("/admin/ask");
  await expect(boss.getByLabel("질문")).toHaveCount(0); // AI 꺼진 상태
  await boss.getByLabel("집계").selectOption({ label: "샵별 강습 수" });
  await boss.getByLabel("월").fill("2026-12");
  await boss.getByRole("button", { name: "보기" }).click();
  await expect(boss.getByRole("status")).toContainText("샵별 강습 수 · 2026-12");
  await expect(boss.getByRole("status")).toContainText("하이원 스노우렌탈");

  await setAiFeatures(true, ["admin_query"]);
  await boss.reload();
  await boss.getByLabel("질문").fill("2026-12 샵별 강습 수 알려줘");
  await boss.getByRole("button", { name: "묻기" }).click();
  await expect(boss.getByRole("status")).toContainText("샵별 강습 수 · 2026-12");
});
