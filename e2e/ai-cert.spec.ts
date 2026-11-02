import { expect, test } from "@playwright/test";
import { as } from "./helpers";
import { setAiFeatures } from "./ai";

// D1 자격증 판독 (가짜 모델): 올리면 본사 검증 화면에 판독값이 참고로 붙고, 성명이 다르면 "확인 필요". 승인은 사람이.
test.beforeAll(async () => setAiFeatures(true, ["cert"]));
test.afterAll(async () => setAiFeatures(false, ["cert"]));

// 1×1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("자격증 이미지 판독값과 강사 입력값 비교", async ({ browser }) => {
  const park = await as(browser, "park@winter.test");
  await park.goto("/instructor/profile");
  await expect(park.getByText("AI 판독 서비스(Anthropic)로 전송됩니다")).toBeVisible();
  await park.getByLabel("발급처").fill("KSIA");
  await park.getByLabel("등급").fill("Level 2");
  await park.locator('input[name="file"]').setInputFiles({ name: "cert.png", mimeType: "image/png", buffer: PNG });
  await park.getByRole("button", { name: "자격증 올리기" }).click();
  await expect(park.getByText("올렸습니다")).toBeVisible();

  const admin = await as(browser, "admin@winter.test");
  await expect(async () => {
    await admin.goto("/admin");
    await expect(admin.getByText("AI 판독 (참고용)").first()).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  const card = admin.getByRole("listitem").filter({ hasText: "박스키" }).filter({ hasText: "AI 판독" });
  await expect(card.getByText("확인 필요")).toBeVisible(); // 판독 성명(홍길동) ≠ 프로필(박스키)
  await expect(card.locator("tr", { hasText: "성명" })).toContainText("홍길동");
  await expect(card.getByRole("button", { name: "승인" })).toBeVisible(); // 승인은 여전히 사람이
});
