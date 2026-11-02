// P19-2 승인된 강습 정정(사유·이력)과 승인된 샵의 사업자번호 변경 요청(본사 승인)
import { expect, test } from "@playwright/test";
import { KIM, PASSWORD, SHOP1, admin, login, userClient } from "./helpers";

test.describe.configure({ mode: "serial" });
const db = admin();
const NOTE = "[테스트] P19-2 정정";

test.afterAll(async () => {
  await db.from("jobs").delete().eq("note", NOTE);
});

test("승인된 강습은 표로 못 고치고, 강습 화면의 정정(사유)으로만 고친다 — 이력이 남는다", async ({ page }) => {
  const resort = (await db.from("resorts").select("id").eq("name", "하이원").single()).data!.id;
  const ski = (await db.from("sports").select("id").eq("name", "스키").single()).data!.id;
  const { data: j } = await db
    .from("jobs")
    .insert({ shop_id: SHOP1, resort_id: resort, sport_id: ski, starts_at: "2027-04-05T01:00:00Z", ends_at: "2027-04-05T03:00:00Z", lesson_type: "private", student_count: 1, instructor_rate: 80000, status: "approved", note: NOTE })
    .select("id")
    .single();
  await db.from("assignments").insert({ job_id: j!.id, instructor_id: KIM, final_rate: 80000, completed_at: new Date().toISOString(), approved_at: new Date().toISOString() });

  const shop = await userClient("shop1@winter.test");
  const moved = await shop.from("jobs").update({ starts_at: "2027-05-05T01:00:00Z", ends_at: "2027-05-05T03:00:00Z" }).eq("id", j!.id);
  expect(moved.error?.message).toContain("정정 절차");
  const rate = await shop.from("assignments").update({ final_rate: 1 }).eq("job_id", j!.id);
  expect(rate.error?.message).toContain("정정 절차");

  await login(page, "shop1@winter.test");
  await page.goto(`/shop/jobs/${j!.id}`);
  await page.getByText("승인된 강습 정정").click();
  await page.getByLabel("끝").fill("13:00");
  await page.getByLabel("강사 지급액").fill("120,000");
  await page.getByLabel("정정 사유").fill("1시간 연장");
  await page.getByRole("button", { name: "정정", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "정정했습니다" })).toBeVisible();

  const { data: a } = await db.from("assignments").select("final_rate, jobs(ends_at)").eq("job_id", j!.id).single();
  expect(a!.final_rate).toBe(120000);
  expect(new Date((a!.jobs as unknown as { ends_at: string }).ends_at).toISOString()).toBe("2027-04-05T04:00:00.000Z");
  const { data: log } = await db.from("lesson_corrections").select("reason, old_values, new_values").eq("job_id", j!.id).single();
  expect(log).toMatchObject({ reason: "1시간 연장", old_values: { final_rate: 80000 }, new_values: { final_rate: 120000 } });
});

test("승인된 샵이 사업자번호를 바꾸면 본사 승인 요청이 되고, 본사가 승인하면 반영된다", async ({ page, browser }) => {
  const tag = Date.now();
  const email = `p192-shop-${tag}@winter.test`;
  const { data: u } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { role: "shop_admin", name: "[테스트] 사업자번호 사장", agreed: true } });
  const { data: shop } = await db.from("shops").insert({ name: "[테스트] 사업자번호샵", type: "rental_shop", status: "approved", business_no: "000-00-19201", created_by: u.user!.id }).select("id").single();
  await db.from("shop_members").upsert({ shop_id: shop!.id, user_id: u.user!.id, is_owner: true });
  const resort = (await db.from("resorts").select("id").eq("name", "하이원").single()).data!.id;
  await db.from("shop_resorts").insert({ shop_id: shop!.id, resort_id: resort });
  try {
    await login(page, email);
    await page.goto("/shop/settings");
    await page.getByLabel(/사업자/).fill("000-00-19299");
    await page.getByRole("button", { name: /저장/ }).click();
    await expect(page.getByText("사업자번호 변경은 본사가 확인한 뒤 반영됩니다")).toBeVisible();
    expect((await db.from("shops").select("business_no").eq("id", shop!.id).single()).data!.business_no).toBe("000-00-19201");
    await page.reload();
    await expect(page.getByText("본사 확인 중: 사업자번호 000-00-19299")).toBeVisible();

    const ctx = await browser.newContext();
    const adminPage = await ctx.newPage();
    await login(adminPage, "admin@winter.test");
    await adminPage.goto("/admin");
    const card = adminPage.getByRole("listitem").filter({ hasText: "[테스트] 사업자번호샵" });
    await expect(card).toContainText("000-00-19201 → 000-00-19299");
    await card.getByRole("button", { name: "승인" }).click();
    await expect(adminPage.getByText("[테스트] 사업자번호샵")).toHaveCount(0);
    await ctx.close();
    expect((await db.from("shops").select("business_no").eq("id", shop!.id).single()).data!.business_no).toBe("000-00-19299");
  } finally {
    await db.from("shops").delete().eq("id", shop!.id);
  }
});
