import { expect, test } from "@playwright/test";
import { as, kstDate, userClient } from "./helpers";
import { formatDay } from "../src/lib/customer/contact";

// 손님 카드: 연락 기록과 다음 연락 (샵만 보고, 강사는 못 본다)
const CUSTOMER = "d0000000-0000-0000-0000-000000000001"; // 손님 하나 (shop1)

test("연락 기록을 남기면 다음 연락일·목적이 바뀌고 기록이 쌓인다", async ({ browser }) => {
  const shop = await as(browser, "shop1@winter.test");
  await shop.goto(`/shop/customers?id=${CUSTOMER}`);
  await expect(shop.getByRole("heading", { name: "연락 기록" })).toBeVisible();

  const next = kstDate(10);
  await shop.getByLabel("방법").selectOption({ label: "전화" });
  await shop.getByLabel("내용").fill("E2E 시즌 오픈 안내");
  await shop.getByLabel("다음 연락일").fill(next);
  await shop.getByLabel("다음 연락 목적").fill("예약 확정 연락");
  await shop.getByRole("button", { name: "연락 기록" }).click();

  await expect(shop.getByText("E2E 시즌 오픈 안내")).toBeVisible();
  await expect(shop.getByText(formatDay(next))).toBeVisible();
  await expect(shop.getByText("예약 확정 연락", { exact: true })).toBeVisible();

  // 강사·다른 샵은 연락 기록을 못 본다
  for (const email of ["kim@winter.test", "shop2@winter.test"]) {
    const c = await userClient(email);
    const { data } = await c.from("customer_contacts").select("id");
    expect(data, email).toEqual([]);
  }
});
