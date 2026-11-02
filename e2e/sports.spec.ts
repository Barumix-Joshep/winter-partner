// P17-2 종목 3개: 강사 프로필 복수 선택, 강사 찾기 종목 필터, 강습 등록 종목, 입찰 공고는 내 종목만
import { expect, test } from "@playwright/test";
import { KIM, PARK, admin, login } from "./helpers";

const db = admin();
const sportId = async (name: string) => (await db.from("sports").select("id").eq("name", name).single()).data!.id as number;
const setSports = async (instructorId: string, names: string[]) => {
  await db.from("instructor_sports").delete().eq("instructor_id", instructorId);
  for (const n of names) await db.from("instructor_sports").insert({ instructor_id: instructorId, sport_id: await sportId(n) });
};

test.afterAll(async () => {
  await setSports(KIM, ["스키"]);
  await setSports(PARK, ["스키"]);
});

test("강사 프로필: 3종목 중 여러 개 고르고 저장, 다시 열어도 그대로, 하나도 안 고르면 안내", async ({ page }) => {
  await login(page, "park@winter.test");
  await page.goto("/instructor/profile");
  const box = (n: string) => page.getByRole("checkbox", { name: n, exact: true });
  await expect(box("스키")).toBeChecked();
  for (const n of ["스노우보드", "스노우스케이트"]) await page.getByText(n, { exact: true }).click();
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByRole("status")).toHaveText(/저장/);

  await page.reload();
  for (const n of ["스키", "스노우보드", "스노우스케이트"]) await expect(box(n)).toBeChecked();

  for (const n of ["스키", "스노우보드", "스노우스케이트"]) await page.getByText(n, { exact: true }).click();
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText("종목을 하나 이상 골라 주세요.")).toBeVisible();
  const { data } = await db.from("instructor_sports").select("sport_id").eq("instructor_id", PARK);
  expect(data).toHaveLength(3); // 저장되지 않았다
});

test("강사 찾기: 종목 필터마다 결과가 다르고, 복수 종목 강사는 양쪽에 나온다", async ({ page }) => {
  await setSports(KIM, ["스키", "스노우보드"]);
  await setSports(PARK, ["스키"]);
  await login(page, "shop1@winter.test");
  const search = async (sport: string) => {
    await page.goto("/shop/instructors");
    await page.getByLabel("종목").selectOption({ label: sport });
    await page.getByRole("button", { name: "검색" }).click();
    await page.waitForURL(/sport=/);
    return page.locator("li span.font-bold").allInnerTexts();
  };
  const ski = await search("스키");
  const board = await search("스노우보드");
  expect(ski).toEqual(expect.arrayContaining(["김스키", "박스키"]));
  expect(board).toContain("김스키");
  expect(board).not.toContain("박스키");
  expect(await search("스노우스케이트")).not.toContain("김스키");
});

test("강습 등록: 종목 3개 모두 고를 수 있다", async ({ page }) => {
  await login(page, "shop1@winter.test");
  await page.goto("/shop/jobs/new");
  const options = await page.locator('select[name="sport_id"] option').allInnerTexts();
  expect(options).toEqual(expect.arrayContaining(["스키", "스노우보드", "스노우스케이트"]));
  await page.locator('select[name="sport_id"]').selectOption({ label: "스노우스케이트" });
  await expect(page.locator('select[name="sport_id"]')).toHaveValue(String(await sportId("스노우스케이트")));
});

test("입찰 공고: 내 종목이 아닌 공고는 보이지 않는다", async ({ page }) => {
  const resort = (await db.from("resorts").select("id").eq("name", "용평").single()).data!.id;
  const starts = new Date(Date.now() + 20 * 86400_000);
  const { data: job } = await db
    .from("jobs")
    .insert({
      shop_id: "b0000000-0000-0000-0000-000000000002", resort_id: resort, sport_id: await sportId("스노우스케이트"),
      starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + 2 * 3600_000).toISOString(),
      lesson_type: "group", student_count: 3, instructor_rate: 150000, assign_mode: "bid", status: "open",
      bid_closes_at: new Date(Date.now() + 5 * 86400_000).toISOString(), note: "P17 스케이트 공고",
    })
    .select("id")
    .single();
  try {
    await login(page, "lee@winter.test"); // 스노우보드 강사
    await page.goto("/instructor/bids");
    await expect(page.getByText("중급 그룹")).toBeVisible(); // 시드의 스노우보드 공고
    await expect(page.getByText("P17 스케이트 공고")).toHaveCount(0);
  } finally {
    await db.from("jobs").delete().eq("id", job!.id);
  }
});
