// P22-1 AI 상담 안내 정보: 기본 템플릿(비활성) → 편집·사용 켜기 → AI 자동 응대 켜기 → 끄기. 390px에서도 쓴다.
import { expect, test } from "@playwright/test";
import { SHOP1, admin, login } from "./helpers";

test("안내 정보를 고쳐 사용으로 켜고, AI 자동 응대를 켰다 끈다 (390px)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "shop1@winter.test");
  await page.goto("/shop/ai-consult/knowledge");
  await expect(page.getByRole("heading", { name: "AI 상담 안내 정보" })).toBeVisible();
  await expect(page.getByText(/사용 중 0개/)).toBeVisible(); // 기본 템플릿은 꺼진 채로 들어 있다
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

  // 강습료 템플릿을 실제 금액으로 고치고 사용으로
  const fee = page.getByRole("form", { name: "안내 정보: 강습료" });
  await fee.getByLabel("내용").fill("[테스트] 1:1 2시간 120,000원 / 1:2 2시간 1인 90,000원");
  await fee.getByLabel("AI 답변에 사용").check();
  await fee.getByRole("button", { name: "저장" }).click();
  await expect(fee.getByRole("status")).toHaveText("저장했습니다.");
  await page.reload();
  await expect(page.getByText(/사용 중 1개/)).toBeVisible();
  await expect(page.getByRole("form", { name: "안내 정보: 강습료" }).getByLabel("내용")).toHaveValue(/120,000원/);

  // 내용이 빈 항목은 사용으로 켤 수 없다
  const add = page.getByRole("form", { name: "안내 정보 추가" });
  await add.getByLabel("제목").fill("[테스트] 빈 항목");
  await add.getByLabel("AI 답변에 사용").check();
  await add.getByRole("button", { name: "추가" }).click();
  await expect(add.getByRole("alert")).toHaveText("내용을 채운 뒤 사용으로 바꿔 주세요.");

  // 켜기 → 끄기 (감사 기록)
  await page.getByRole("button", { name: "AI 자동 응대 켜기" }).click();
  await expect(page.getByRole("button", { name: "AI 자동 응대 끄기" })).toHaveText("켜짐");
  await page.getByRole("button", { name: "AI 자동 응대 끄기" }).click();
  await expect(page.getByRole("button", { name: "AI 자동 응대 켜기" })).toHaveText("꺼짐");
  const { data } = await admin().from("audit_events").select("action").eq("shop_id", SHOP1).like("action", "consult_auto_reply_%").order("created_at");
  expect((data ?? []).map((r) => r.action).slice(-2)).toEqual(["consult_auto_reply_on", "consult_auto_reply_off"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("다른 샵의 안내 정보는 보이지 않는다", async ({ page }) => {
  await login(page, "shop2@winter.test");
  await page.goto("/shop/ai-consult/knowledge");
  await expect(page.getByText(/사용 중 0개/)).toBeVisible();
  await expect(page.getByText("[테스트] 1:1 2시간 120,000원")).toHaveCount(0);
});
