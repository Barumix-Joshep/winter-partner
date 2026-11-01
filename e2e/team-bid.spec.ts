import { expect, test } from "@playwright/test";
import { PARK, admin, as, createJob, kstDate, moveJobToPast } from "./helpers";

// 2단계 팀 입찰: 공고(팀 입찰 허용) → 강습팀 입찰 → 선정 → 팀장이 팀원 지정 → 완료 보고 → 승인 → 팀 정산(원천세 0) → PDF
const TEAM = "b0000000-0000-0000-0000-000000000003"; // 평창 라이딩스쿨 (team@)

test("팀 입찰부터 팀 정산 수령까지", async ({ browser }) => {
  // 박스키를 강습팀 전속(팀원)으로
  await admin().from("shop_instructors").upsert({ shop_id: TEAM, instructor_id: PARK });

  const shop = await as(browser, "shop2@winter.test");
  const jobId = await createJob(shop, { date: kstDate(30), customer: "팀 손님", phone: "010-0000-4001", rate: 200000, note: "E2E 팀 입찰" });
  await shop.getByLabel("강습팀 입찰도 받기").check();
  await shop.getByRole("button", { name: "입찰 공고 올리기" }).click();
  await expect(shop.getByText("강습팀 입찰 허용")).toBeVisible();

  const team = await as(browser, "team@winter.test");
  await team.goto("/shop/team-bids");
  const post = team.getByRole("listitem").filter({ hasText: "E2E 팀 입찰" });
  await expect(post).not.toContainText("010-0000-4001");
  await post.getByLabel("팀 제시 금액").fill("180000");
  await post.getByRole("button", { name: "팀으로 입찰" }).click();
  await expect(post.getByText("입찰함")).toBeVisible();

  // 공고 샵이 팀 입찰을 선정
  await shop.reload();
  const bid = shop.getByRole("listitem").filter({ hasText: "평창 라이딩스쿨 (팀)" });
  await expect(bid).toContainText("180,000원");
  await bid.getByRole("button", { name: "선정" }).click();
  await expect(shop.getByText("배정: 평창 라이딩스쿨 (팀) · 팀원 지정 전")).toBeVisible();

  // 팀장이 팀원 지정
  await team.goto("/shop/team-bids");
  const lesson = team.getByRole("listitem").filter({ hasText: "E2E 팀 입찰" });
  await expect(lesson).toContainText("팀원 지정 필요");
  await lesson.getByLabel("맡을 팀원").selectOption({ label: "박스키" });
  await lesson.getByRole("button", { name: "팀원 지정" }).click();
  await expect(lesson).toContainText("맡은 팀원: 박스키");
  await shop.reload();
  await expect(shop.getByText("배정: 평창 라이딩스쿨 (팀) · 박스키")).toBeVisible();

  // 팀원이 완료 보고, 공고 샵이 승인
  await moveJobToPast(jobId);
  const park = await as(browser, "park@winter.test");
  await park.goto("/instructor");
  await park.locator("article").filter({ has: park.getByRole("button", { name: "완료 보고하기" }) }).getByRole("button", { name: "완료 보고하기" }).click();
  await expect(park.getByRole("status")).toContainText("완료 보고했습니다");
  await shop.goto(`/shop/jobs/${jobId}`);
  await shop.getByRole("button", { name: "승인" }).click();
  await expect(shop.getByText("승인했습니다.")).toBeVisible();

  // 정산: 팀에게 원천세 없이
  await shop.goto("/shop/settlements");
  await shop.getByRole("button", { name: /이 달 정산 집계|다시 집계/ }).click();
  const row = shop.getByRole("listitem").filter({ hasText: "평창 라이딩스쿨 (팀)" }).first();
  await expect(row).toContainText("총액 180,000원");
  await expect(row).toContainText("원천세 0원");
  await expect(row).toContainText("실지급 180,000원");
  await shop.getByRole("button", { name: "정산서 발행" }).click();
  await expect(row).toContainText("정산서 발행");

  // 팀이 받을 정산과 PDF
  await team.goto("/shop/settlements");
  const recv = team.getByRole("listitem").filter({ hasText: "용평 알파인샵" });
  await expect(recv).toContainText("받을 금액 180,000원");
  const { data: st } = await admin().from("settlements").select("id").eq("payee_shop_id", TEAM).single();
  const pdf = await team.request.get(`/settlements/${st!.id}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
});
