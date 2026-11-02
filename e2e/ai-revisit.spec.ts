import { expect, test } from "@playwright/test";
import { admin, as } from "./helpers";
import { setAiFeatures } from "./ai";

// C1 재방문 후보·안내 문구 (가짜 모델): 광고 동의가 유효한 손님만, 문구는 복사용
test.beforeAll(async () => setAiFeatures(true, ["revisit"]));
test.afterAll(async () => setAiFeatures(false, ["revisit"]));

test("광고 동의한 손님만 후보로 보이고 문구 초안을 만든다", async ({ browser }) => {
  const db = admin();
  // 손님 둘: 지난 강습 승인 + 본인(QR) 광고 동의
  await db.from("jobs").update({ status: "approved" }).eq("id", "e0000000-0000-0000-0000-000000000001");
  await db.from("customer_consents").insert({
    shop_id: "b0000000-0000-0000-0000-000000000001",
    customer_id: "d0000000-0000-0000-0000-000000000002",
    kind: "marketing",
    granted: true,
    subject: "self",
    method: "qr",
    text_version: "marketing-2026-11-v1",
  });

  const shop = await as(browser, "shop1@winter.test");
  await shop.goto("/shop/revisit");
  const row = shop.getByRole("listitem").filter({ hasText: "손님 둘" });
  await expect(row).toBeVisible();
  await expect(shop.getByRole("listitem").filter({ hasText: "손님 하나" })).toHaveCount(0); // 직원 기록뿐이라 제외
  await shop.getByRole("button", { name: "안내 문구 초안 만들기" }).click();
  await expect(row.getByRole("textbox")).toHaveValue(/^\(광고\) 손님 둘님, 올 시즌도/);
});
