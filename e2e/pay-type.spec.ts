// P19-1 강사별 지급 방식: 전속 2명 중 1명만 "원천징수 샵 별도 처리"인 샵의 한 달 정산.
// 화면에서 지급 방식을 바꾸고 집계 → 화면 합계 = Excel 요약 합계 = 저장된 정산서(PDF가 쓰는 값).
import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { PASSWORD, admin, login } from "./helpers";

test.describe.configure({ mode: "serial" });
const db = admin();
const tag = Date.now();
const mail = (k: string) => `paytype-${k}-${tag}@winter.test`;
const kst = (d: number, h: number) => new Date(Date.UTC(2026, 8, d, h - 9)).toISOString(); // 2026년 9월, KST
const S = { shop: "", a: "", b: "" };

test.beforeAll(async () => {
  const users: Record<string, string> = {};
  for (const [k, role, name] of [["owner", "shop_admin", "[테스트] 지급방식 사장"], ["a", "instructor", "[테스트] 전속가"], ["b", "instructor", "[테스트] 전속나"]]) {
    const { data } = await db.auth.admin.createUser({ email: mail(k), password: PASSWORD, email_confirm: true, user_metadata: { role, name, agreed: true } });
    users[k] = data.user!.id;
  }
  S.shop = (await db.from("shops").insert({ name: "[테스트] 지급방식샵", type: "rental_shop", status: "approved", created_by: users.owner }).select("id").single()).data!.id;
  await db.from("shop_members").upsert({ shop_id: S.shop, user_id: users.owner, is_owner: true });
  const resort = (await db.from("resorts").select("id").eq("name", "하이원").single()).data!.id;
  const ski = (await db.from("sports").select("id").eq("name", "스키").single()).data!.id;
  for (const k of ["a", "b"] as const) {
    S[k] = (await db.from("instructors").select("id").eq("user_id", users[k]).single()).data!.id;
    expect((await db.from("shop_instructors").insert({ shop_id: S.shop, instructor_id: S[k] })).error).toBeNull();
  }
  // 전속가 100,000 + 50,000 / 전속나 200,000 (모두 승인)
  const lessons: ["a" | "b", number, number][] = [["a", 3, 100000], ["a", 4, 50000], ["b", 5, 200000]];
  for (const [k, d, rate] of lessons) {
    const { data: job, error } = await db
      .from("jobs")
      .insert({ shop_id: S.shop, resort_id: resort, sport_id: ski, starts_at: kst(d, 10), ends_at: kst(d, 12), lesson_type: "private", student_count: 1, status: "approved", note: "[테스트] 지급방식" })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect((await db.from("assignments").insert({ job_id: job!.id, instructor_id: S[k], final_rate: rate, approved_at: new Date().toISOString() })).error).toBeNull();
  }
});

test.afterAll(async () => {
  await db.from("shops").delete().eq("id", S.shop);
});

test("기본은 모두 3.3%, 한 명만 샵 별도 처리로 바꾸면 그 강사만 원천세 0 — 화면·Excel·정산서 합계 일치", async ({ page }) => {
  await login(page, mail("owner"));
  await page.goto("/shop/team");
  const pick = page.getByLabel("[테스트] 전속나 지급 방식");
  await expect(pick).toHaveValue("business_3_3");
  await expect(page.getByLabel("[테스트] 전속가 지급 방식")).toHaveValue("business_3_3");
  await expect(page.getByText("세무 확인 후 선택하세요").first()).toBeVisible();
  await pick.selectOption("none_by_shop");
  await pick.locator("xpath=ancestor::form").getByRole("button", { name: "저장" }).click();
  await expect(page.getByText(/변경: 사업소득 3\.3% → 원천징수 샵 별도 처리/)).toBeVisible();

  await page.goto("/shop/settlements?month=2026-09");
  await page.getByRole("button", { name: "이 달 정산 집계" }).click();
  await expect(page.getByText("350,000원").first()).toBeVisible();
  // 전속가 150,000 → 4,500 + 450 = 4,950 / 전속나 0
  await expect(page.getByText("4,950원").first()).toBeVisible();
  await expect(page.getByText("345,050원").first()).toBeVisible();
  await expect(page.getByText(/1건 · 원천징수 샵 별도 처리/)).toBeVisible();
  await expect(page.getByText("원천세 샵 별도 처리")).toBeVisible();

  const { data: rows } = await db.from("settlements").select("id, instructor_id, gross, withholding, net, pay_type").eq("shop_id", S.shop);
  const byI = Object.fromEntries((rows ?? []).map((r) => [r.instructor_id, r]));
  expect(byI[S.a]).toMatchObject({ gross: 150000, withholding: 4950, net: 145050, pay_type: "business_3_3" });
  expect(byI[S.b]).toMatchObject({ gross: 200000, withholding: 0, net: 200000, pay_type: "none_by_shop" });

  const xlsx = await page.request.get("/shop/settlements/export?month=2026-09");
  expect(xlsx.status()).toBe(200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await xlsx.body()) as unknown as ExcelJS.Buffer);
  const sum = wb.getWorksheet("정산 요약")!;
  const total = sum.getRow(sum.rowCount).values as unknown[];
  expect(total.slice(1, 10)).toEqual(["합계", undefined, undefined, 3, 350000, 4500, 450, 4950, 345050]);
  const labels = [2, 3].map((r) => `${sum.getRow(r).getCell(1).value}:${sum.getRow(r).getCell(3).value}`).sort();
  expect(labels).toEqual(["[테스트] 전속가:사업소득 3.3%", "[테스트] 전속나:원천징수 샵 별도 처리"]);

  for (const r of rows ?? []) {
    const pdf = await page.request.get(`/settlements/${r.id}/pdf`);
    expect(pdf.status()).toBe(200);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  }

  // 발행 뒤 다시 3.3%로 바꿔도 발행된 정산서는 그대로
  await page.getByRole("button", { name: "정산서 발행" }).click();
  await expect(page.getByText("정산서 발행").first()).toBeVisible();
  await page.goto("/shop/team");
  await pick.selectOption("business_3_3");
  await pick.locator("xpath=ancestor::form").getByRole("button", { name: "저장" }).click();
  await expect(page.getByText(/변경: 원천징수 샵 별도 처리 → 사업소득 3\.3%/)).toBeVisible();
  await page.goto("/shop/settlements?month=2026-09");
  await page.getByRole("button", { name: "다시 집계" }).click();
  await expect(page.getByText("345,050원").first()).toBeVisible();
  const after = (await db.from("settlements").select("withholding, pay_type, status").eq("instructor_id", S.b).single()).data;
  expect(after).toEqual({ withholding: 0, pay_type: "none_by_shop", status: "issued" });
});
