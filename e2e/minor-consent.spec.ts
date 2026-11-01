import { expect, test } from "@playwright/test";
import { as } from "./helpers";

// 14세 미만 손님: 보호자 필수, 보호자가 링크에서 직접 고른 선택 동의만 유효
test("14세 미만 손님 등록과 보호자 동의 링크", async ({ browser }) => {
  const shop = await as(browser, "shop1@winter.test");
  const year = new Date().getFullYear() - 9;
  await shop.goto("/shop/customers?new=1");
  await shop.getByLabel("이름", { exact: true }).fill("E2E 어린이");
  await shop.getByLabel("출생 연도 (선택)").fill(String(year));
  await shop.getByRole("button", { name: "손님 등록" }).click();
  await expect(shop.getByText("14세 미만은 보호자 이름이 필요합니다.")).toBeVisible();

  await shop.getByLabel(/^보호자/).first().fill("E2E 보호자");
  await shop.getByLabel("보호자 연락처").fill("010-5000-0001");
  await shop.getByRole("button", { name: "손님 등록" }).click();
  await expect(shop.getByText("14세 미만 · 보호자 동의")).toBeVisible();
  // 동의 체크박스는 없고 수집 안내만 있다
  await expect(shop.locator('input[name="privacy_consent"], input[name="marketing_consent"]')).toHaveCount(0);

  await shop.getByRole("button", { name: "보호자 동의 링크 만들기" }).click();
  const url = await shop.getByLabel("동의 링크").inputValue();
  expect(url).toMatch(/\/consent\/[A-Za-z0-9_-]{32}$/);

  // 보호자: 로그인 없이 링크에서 직접 고른다
  const guardianCtx = await browser.newContext();
  const g = await guardianCtx.newPage();
  await g.goto(url);
  await expect(g.getByRole("heading", { name: "E○○ 손님 선택 동의" })).toBeVisible();
  await expect(g.getByText("보호자께서 직접 골라 주세요")).toBeVisible();
  await expect(g.getByText("010-5000-0001")).toHaveCount(0); // 연락처는 보이지 않는다
  await g.getByLabel(/시즌 안내·할인 소식/).check();
  await g.getByLabel(/법정대리인/).check();
  await g.getByRole("button", { name: "선택 저장" }).click();
  await expect(g.getByRole("status")).toContainText("선택을 저장했습니다");

  // 같은 링크는 다시 쓸 수 없다
  await g.goto(url);
  await expect(g.getByText("만료됐거나 이미 쓴 링크입니다")).toBeVisible();

  await shop.reload();
  await expect(shop.getByText(/동의 \(보호자 · 링크/)).toBeVisible();
  await expect(shop.getByText(/철회 \(보호자 · 링크/)).toBeVisible(); // 사진은 고르지 않음
});
