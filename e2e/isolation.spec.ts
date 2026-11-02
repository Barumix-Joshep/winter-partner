import { expect, test } from "@playwright/test";
import { SHOP1, as, userClient } from "./helpers";

// 다른 샵 데이터 접근 차단, 강사는 손님 연락처를 못 본다
const SHOP1_JOB = "e0000000-0000-0000-0000-000000000001";

test("다른 샵 강습 상세는 열리지 않는다", async ({ browser }) => {
  const shop2 = await as(browser, "shop2@winter.test");
  await shop2.goto(`/shop/jobs/${SHOP1_JOB}`);
  // 스트리밍 응답이라 상태 코드는 200이 먼저 나간다. 내용으로 확인한다.
  await expect(shop2.getByText(/could not be found|찾을 수 없/)).toBeVisible();
  await expect(shop2.getByText("첫 강습, 겁이 많음")).toHaveCount(0);
  await expect(shop2.getByText("010-0000-1002")).toHaveCount(0);
  await shop2.goto("/shop/customers");
  await expect(shop2.getByText("손님 셋")).toBeVisible();
  await expect(shop2.getByText("손님 하나")).toHaveCount(0);
  await expect(shop2.getByText("010-0000-1001")).toHaveCount(0);
});

test("DB 직접 조회도 RLS로 막힌다", async () => {
  const shop2 = await userClient("shop2@winter.test");
  for (const table of ["customers", "jobs", "job_prices", "settlements"] as const) {
    const col = table === "job_prices" ? "job_id" : "id";
    const q = shop2.from(table).select(col);
    const { data, error } = table === "job_prices" ? await q.eq("job_id", SHOP1_JOB) : await q.eq("shop_id", SHOP1);
    expect(error, table).toBeNull();
    expect(data, table).toEqual([]);
  }
  // P13에서 생긴 손님 관련 테이블도 다른 샵 행은 보이지 않는다
  const admin_ = (await import("./helpers")).admin();
  await admin_.from("customer_contacts").insert({ shop_id: SHOP1, customer_id: "d0000000-0000-0000-0000-000000000001", channel: "phone", memo: "격리 확인" });
  for (const table of ["customer_consents", "customer_contacts", "consent_links", "registration_links", "health_warnings", "access_logs", "customer_erasures"] as const) {
    const { data } = await shop2.from(table).select("shop_id").eq("shop_id", SHOP1);
    expect(data ?? [], table).toEqual([]);
  }
  const { data: own } = await (await userClient("shop1@winter.test")).from("customer_contacts").select("id").eq("shop_id", SHOP1);
  expect((own ?? []).length).toBeGreaterThan(0);

  const { error } = await shop2.from("customers").insert({ shop_id: SHOP1, name: "침입" });
  expect(error).not.toBeNull();

  const kim = await userClient("kim@winter.test");
  const { data: cust } = await kim.from("customers").select("phone");
  expect(cust).toEqual([]);
});

test("강사는 샵 화면에, 샵은 강사 화면에 들어갈 수 없다", async ({ browser }) => {
  const kim = await as(browser, "kim@winter.test");
  await kim.goto("/shop/customers");
  await expect(kim).not.toHaveURL(/\/shop/);
  const shop2 = await as(browser, "shop2@winter.test");
  await shop2.goto("/instructor/pay");
  await expect(shop2).not.toHaveURL(/\/instructor/);
});
