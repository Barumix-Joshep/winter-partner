import { expect, test } from "@playwright/test";
import { admin, as, createJob, kstDate, moveJobToPast, userClient } from "./helpers";

// 샵 강습 등록 → 입찰 공고 → 프리랜서 입찰 → 선정(금액 조정) → 완료 보고 → 승인 → 월 정산 → PDF
// 전속 강사에게는 공고가 보이지 않는다.
test.describe.configure({ mode: "serial" });

test("입찰부터 정산서 PDF까지", async ({ browser }) => {
  const shop = await as(browser, "shop1@winter.test");
  const date = kstDate(20);
  const jobId = await createJob(shop, { date, customer: "입찰 손님", phone: "010-0000-2001", rate: 100000, note: "E2E 입찰 강습" });
  await expect(shop.getByText("010-0000-2001")).toBeVisible(); // 샵은 손님 연락처를 본다

  await shop.getByRole("button", { name: "입찰 공고 올리기" }).click();
  await expect(shop.getByRole("heading", { name: "입찰 현황" })).toBeVisible();

  // 프리랜서 김스키: 공고를 보고 금액 제시
  const kim = await as(browser, "kim@winter.test");
  await kim.goto("/instructor/bids");
  const card = kim.getByRole("listitem").filter({ hasText: "E2E 입찰 강습" });
  await expect(card).toBeVisible();
  await expect(card).not.toContainText("010-0000-2001");
  await card.getByLabel("제시 금액").fill("90000");
  await card.getByRole("button", { name: "금액 제시" }).click();
  await expect(card.getByText("입찰함")).toBeVisible();

  // 전속 오전속: 화면에도, DB 조회(RLS)에도 공고가 없다
  const excl = await as(browser, "excl@winter.test");
  await excl.goto("/instructor/bids");
  await expect(excl.getByText("전속 강사는 입찰 공고를 볼 수 없습니다.")).toBeVisible();
  await expect(excl.getByText("E2E 입찰 강습")).toHaveCount(0);
  const exclDb = await userClient("excl@winter.test");
  const { data: seen } = await exclDb.from("jobs").select("id").eq("id", jobId);
  expect(seen).toEqual([]);

  // 샵: 금액을 조정해 선정
  await shop.reload();
  const bid = shop.getByRole("listitem").filter({ hasText: "김스키" });
  await expect(bid).toContainText("90,000원");
  await bid.getByLabel("확정 금액").fill("95000");
  await bid.getByRole("button", { name: "선정" }).click();
  await expect(shop.getByText("배정: 김스키")).toBeVisible();

  // 강습이 끝났다고 치고 강사가 완료 보고
  await moveJobToPast(jobId);
  await kim.goto("/instructor");
  const report = kim.locator("article").filter({ has: kim.getByRole("button", { name: "완료 보고하기" }) });
  await expect(report).toHaveCount(1);
  await report.getByPlaceholder(/강습 노트/).fill("턴 연습까지 진행");
  await report.getByRole("button", { name: "완료 보고하기" }).click();
  // 보고하면 '완료 보고 필요' 목록에서 빠지고 오늘 강습에 '승인 필요'로 보인다
  await expect(kim.getByRole("button", { name: "완료 보고하기" })).toHaveCount(0);
  await expect(kim.getByText("승인 필요")).toBeVisible();

  // 샵 승인
  await shop.goto(`/shop/jobs/${jobId}`);
  await expect(shop.getByText("턴 연습까지 진행")).toBeVisible();
  await shop.getByRole("button", { name: "승인" }).click();
  await expect(shop.getByText("승인했습니다. 이 금액이 월 정산에 들어갑니다.")).toBeVisible();

  // 월 정산: 95,000원, 3.3% 원천세 3,130원(10원 미만 절사), 실지급 91,870원
  await shop.goto("/shop/settlements");
  await shop.getByRole("button", { name: /이 달 정산 집계|다시 집계/ }).click();
  const row = shop.getByRole("listitem").filter({ hasText: "김스키" }).first();
  await expect(row).toContainText("총액 95,000원");
  await expect(row).toContainText("원천세 3,130원");
  await expect(row).toContainText("실지급 91,870원");
  await shop.getByRole("button", { name: "정산서 발행" }).click();
  await expect(row).toContainText("정산서 발행");

  const { data: st } = await admin().from("settlements").select("id").eq("instructor_id", "c0000000-0000-0000-0000-000000000021").single();
  const pdf = await shop.request.get(`/settlements/${st!.id}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");

  // 강사 본인도 자기 정산서를 받는다
  const kimPdf = await kim.request.get(`/settlements/${st!.id}/pdf`);
  expect(kimPdf.status()).toBe(200);
});
