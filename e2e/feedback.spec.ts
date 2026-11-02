import { expect, test } from "@playwright/test";
import { as } from "./helpers";

// P16-6 의견 보내기 (화면 주소 자동 첨부, 연락처 가림) → 본사 목록·상태 관리
test("샵 관리자가 의견을 보내고 본사가 처리한다", async ({ browser }) => {
  const shop = await as(browser, "shop1@winter.test");
  await shop.goto("/shop/customers");
  await shop.getByRole("button", { name: "의견 보내기" }).click();
  await expect(shop.getByText("개인정보는 적지 마세요")).toBeVisible();
  const mark = `E2E 의견 ${Math.random().toString(36).replace(/[0-9.]/g, "").slice(0, 8)}`;
  const body = `${mark} 손님 010-1234-5678 등록이 느려요`;
  await shop.getByLabel("내용").fill(body);
  await shop.getByRole("button", { name: "보내기", exact: true }).click();
  await expect(shop.getByRole("status").filter({ hasText: "고맙습니다" })).toContainText("가려서 받았습니다");

  const boss = await as(browser, "admin@winter.test");
  await boss.goto("/admin/feedback");
  const item = boss.getByRole("listitem").filter({ hasText: body.replace("010-1234-5678", "[전화]") });
  await expect(item).toContainText("/shop/customers");
  await expect(item).toContainText("샵 관리자");
  await expect(item).not.toContainText("010-1234-5678");
  await item.getByLabel("상태").selectOption("done");
  await item.getByLabel("메모").fill("다음 배포에서 개선");
  await item.getByRole("button", { name: "저장" }).click();
  await expect(item).toBeHidden(); // 처리 전 목록에서 빠진다
  await boss.goto("/admin/feedback?status=done");
  const done = boss.getByRole("listitem").filter({ hasText: mark });
  await expect(done.getByLabel("메모")).toHaveValue("다음 배포에서 개선");
});

test("손님이 여는 동의 링크 화면에는 의견 버튼이 없다", async ({ page }) => {
  await page.goto("/consent/not-a-token");
  await expect(page.getByRole("button", { name: "의견 보내기" })).toHaveCount(0);
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "의견 보내기" })).toBeVisible();
});
