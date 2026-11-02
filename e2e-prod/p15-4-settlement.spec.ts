import { expect, test } from "@playwright/test";
import { as, prodDb, report } from "./helpers";

// P15-4 운영 서버에서 정산 집계 → 정산서 PDF(한글 글꼴)·Excel 내려받기 (테스트 샵 2026-02 가상 강습, AI 없음)
test("운영 정산서 PDF·Excel", async ({ browser }) => {
  const shop = await as(browser, "test-rental");
  await shop.goto("/shop/settlements?month=2026-02");
  await shop.getByRole("button", { name: /이 달 정산 집계|다시 집계/ }).click();
  await expect(shop.getByRole("listitem").filter({ hasText: "[테스트] 강사가" }).first()).toContainText("원천세 5,280원"); // 2건 × 80,000원 = 160,000원, 3.3%
  const { data: shopRow } = await prodDb().from("shops").select("id").eq("name", "[테스트] 하이원 렌탈").single();
  const { data: st } = await prodDb().from("settlements").select("id").eq("shop_id", shopRow!.id).eq("month", "2026-02-01").limit(1).single();
  const t0 = Date.now();
  const pdf = await shop.request.get(`/settlements/${st!.id}/pdf`);
  const pdfMs = Date.now() - t0;
  const body = await pdf.body();
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect(body.subarray(0, 4).toString()).toBe("%PDF");
  const xlsx = await shop.request.get("/shop/settlements/export?month=2026-02");
  expect(xlsx.status()).toBe(200);
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
  report("P15-4 prod settlement", { pdfMs, pdfBytes: body.length, xlsxBytes: (await xlsx.body()).length });
});
