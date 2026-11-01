import { expect, test } from "@playwright/test";
import { as, kstDate } from "./helpers";

// QR 셀프 등록 → 샵 확인(병합) → 강습 등록
const EXISTING = "d0000000-0000-0000-0000-000000000001"; // 손님 하나, 010-0000-1001 (shop1)

test("QR 셀프 등록, 같은 연락처 병합, 강습 등록", async ({ browser }) => {
  const shop = await as(browser, "shop1@winter.test");
  await shop.goto("/shop/register-qr");
  await shop.getByRole("button", { name: "QR 만들기" }).click();
  const url = await shop.getByLabel("등록 주소").inputValue();
  expect(url).toMatch(/\/join\/[A-Za-z0-9_-]{32}$/);
  await expect(shop.locator("svg").first()).toBeVisible();

  // 손님: 로그인 없이 휴대폰에서 등록. 샵 이름 말고는 아무 손님 정보도 보이지 않는다
  const guestCtx = await browser.newContext();
  const g = await guestCtx.newPage();
  await g.goto(url);
  await expect(g.getByText("하이원 스노우렌탈")).toBeVisible();
  await expect(g.getByText(/손님 하나|손님 둘|010-0000-100/)).toHaveCount(0);
  await g.getByLabel("이름", { exact: true }).fill("E2E 셀프손님");
  await g.getByLabel(/^휴대폰/).fill("010-0000-1001");
  await g.getByLabel("레벨").selectOption("중급");
  await g.getByLabel("장비 사이즈").fill("키 165 · 발 250");
  await g.getByLabel(/시즌 안내·할인 소식/).check();
  await g.getByRole("button", { name: "등록하기" }).click();
  await expect(g.getByRole("status")).toContainText("등록했습니다");

  // 잘못된 토큰은 아무것도 보여 주지 않는다
  await g.goto(url.replace(/[A-Za-z0-9_-]{32}$/, "x".repeat(32)));
  await expect(g.getByText("만료됐거나 폐기된 링크입니다")).toBeVisible();

  // 샵: 확인 필요 → 기존 카드로 합치기
  await shop.goto("/shop/customers");
  await expect(shop.getByText("셀프 등록 확인 필요 1명")).toBeVisible();
  await shop.getByRole("link", { name: /E2E 셀프손님/ }).click();
  await expect(shop.getByText(/같은 연락처의 기존 손님/)).toBeVisible();
  await shop.getByRole("button", { name: "기존 카드로 합치기" }).click();
  await shop.waitForURL(new RegExp(`id=${EXISTING}`));
  await expect(shop.getByRole("heading", { name: "손님 하나" })).toBeVisible();
  await expect(shop.getByText("키 165 · 발 250")).toBeVisible();
  await expect(shop.getByText(/동의 \(본인 · QR/)).toBeVisible();
  await expect(shop.getByText("셀프 등록 확인 필요")).toHaveCount(0);

  // 합친 손님으로 강습 등록
  await shop.getByRole("link", { name: "강습 등록", exact: true }).click();
  await shop.getByLabel("날짜", { exact: true }).fill(kstDate(40));
  await shop.getByLabel(/강사 지급액/).fill("80000");
  await shop.getByRole("button", { name: "임시 저장" }).click();
  await shop.waitForURL(/\/shop\/jobs$/);
  await shop.goto(`/shop/customers?id=${EXISTING}`);
  await expect(shop.getByText("강습 이력 · 강사 수업 메모").locator("..")).toContainText("스키");
});
