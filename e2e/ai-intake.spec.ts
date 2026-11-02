import { expect, test } from "@playwright/test";
import { as } from "./helpers";
import { setAiFeatures } from "./ai";

// AI 켠 E2E (가짜 모델): 붙여넣기 → 폼 채움 → 확인 후 저장. 연락처는 AI로 가지 않는다.
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => setAiFeatures(true, ["intake"]));
test.afterAll(async () => setAiFeatures(false, ["intake"]));

test("문자 붙여넣기로 강습 등록 칸을 채우고 저장한다", async ({ browser }) => {
  const shop = await as(browser, "shop1@winter.test");
  await shop.goto("/shop/jobs/new");
  const year = new Date().getFullYear() + 1;
  await shop.getByLabel("문자·카톡 붙여넣기").fill(`안녕하세요 1/9 오전 10시 스키 1:2 예약할게요 둘 다 초급, 패치는 샵에서 사주세요. 010-1234-5678`);
  await shop.getByRole("button", { name: "자동 입력" }).click();
  await expect(shop.getByRole("status")).toContainText("칸을 채웠습니다");

  await expect(shop.getByLabel("날짜", { exact: true })).toHaveValue(`${year}-01-09`);
  await expect(shop.getByLabel("시작", { exact: true })).toHaveValue("10:00");
  await expect(shop.getByLabel("끝", { exact: true })).toHaveValue("12:00");
  await expect(shop.getByLabel("강습 유형")).toHaveValue("semi");
  await expect(shop.getByLabel("인원")).toHaveValue("2");
  await expect(shop.getByLabel("레벨", { exact: true })).toHaveValue("초급");

  // 사장님이 확인하고 나머지를 채워 저장 (AI는 저장하지 않는다)
  await shop.getByLabel("이름", { exact: true }).fill("AI 접수 손님");
  await shop.getByLabel(/강사 지급액/).fill("120000");
  await shop.getByRole("button", { name: "임시 저장" }).click();
  await shop.waitForURL(/\/shop\/jobs$/);
  await expect(shop.getByText(`1/9(`).first()).toBeVisible();
});

test("AI를 끄면 붙여넣기 칸이 없고 직접 입력 그대로", async ({ browser }) => {
  await setAiFeatures(false, ["intake"]);
  const shop = await as(browser, "shop1@winter.test");
  await shop.goto("/shop/jobs/new");
  await expect(shop.getByLabel("날짜", { exact: true })).toBeVisible();
  await expect(shop.getByLabel("문자·카톡 붙여넣기")).toHaveCount(0);
});
