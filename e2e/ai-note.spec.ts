import { expect, test } from "@playwright/test";
import { admin, as, createJob, kstDate, moveJobToPast, PARK, addAvailability } from "./helpers";
import { setAiFeatures } from "./ai";

// B1 수업 메모 정리 + D2 건강정보 2차 감지 (가짜 모델)
test.beforeAll(async () => setAiFeatures(true, ["note_tidy", "health_check"]));
test.afterAll(async () => setAiFeatures(false, ["note_tidy", "health_check"]));

test("정리하기로 메모를 다듬고, 단어 검사에 안 걸린 건강 문장은 AI가 경고", async ({ browser }) => {
  const date = kstDate(33);
  await addAvailability(PARK, date);
  const shop = await as(browser, "shop1@winter.test");
  const jobId = await createJob(shop, { date, customer: "메모 손님", phone: "010-0000-6001", rate: 70000, note: "E2E 메모 정리" });
  await shop.getByRole("listitem").filter({ hasText: "박스키" }).getByRole("button", { name: "의뢰 보내기" }).click();
  const park = await as(browser, "park@winter.test");
  await park.goto("/instructor");
  await park.locator("section").filter({ hasText: "E2E 메모 정리" }).getByRole("button", { name: "수락" }).click();
  await moveJobToPast(jobId);

  await park.goto("/instructor");
  const card = park.locator("article").filter({ has: park.getByRole("button", { name: "완료 보고하기" }) });
  await card.getByLabel("강습 노트").fill("플루그보겐까지 진행, 내려오다 넘어져서 손목이 아프다고 함");
  await card.getByRole("button", { name: "정리하기" }).click();
  await expect(card.getByLabel("강습 노트")).toHaveValue(/^진도: 플루그보겐까지 진행\n잘된 점: .+\n다음 과제: .+/);
  await expect(card.getByRole("alert")).toContainText("손목이 아프다고 함");

  // 강사가 건강 문장을 지우지 않고 그대로 보고 → 단어 검사(1차)엔 안 걸리지만 AI(2차)가 경고 기록
  await card.getByLabel("강습 노트").fill("플루그보겐까지 진행, 내려오다 넘어져서 손목을 다쳤다고 함");
  await card.getByRole("button", { name: "완료 보고하기" }).click();
  await expect(park.getByRole("status")).toContainText("건강 정보로 보이는 단어가 있어 기록해 두었습니다");
  const { data } = await admin().from("health_warnings").select("terms").eq("job_id", jobId);
  expect(data).toEqual([{ terms: ["AI:부상"] }]);
});
