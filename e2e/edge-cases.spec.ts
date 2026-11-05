// P18-4 예외 시나리오: 빈 상태, 큰 데이터(CSV 손님 500명·강습 1000건), 특수문자·HTML, 느린 네트워크, 로그아웃 뒤 뒤로 가기
import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, admin, login } from "./helpers";

test.describe.configure({ mode: "serial" });
const db = admin();
const email = `edge-${Date.now()}@winter.test`;
let shopId = "";
const csv = (name: string, body: string) => ({ name, mimeType: "text/csv", buffer: Buffer.from(body) });
const noCrash = async (page: Page) => {
  await expect(page.getByText(/Application error|Unhandled Runtime Error|문제가 생겼습니다/)).toHaveCount(0);
};

test.beforeAll(async () => {
  const { data: u } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { role: "shop_admin", name: "[테스트] 예외사장", agreed: true } });
  const { data: shop } = await db.from("shops").insert({ name: "[테스트] 예외샵", type: "rental_shop", status: "approved", created_by: u.user!.id }).select("id").single();
  shopId = shop!.id;
  await db.from("shop_members").upsert({ shop_id: shopId, user_id: u.user!.id, is_owner: true });
  const { data: r } = await db.from("resorts").select("id").eq("name", "하이원").single();
  await db.from("shop_resorts").insert({ shop_id: shopId, resort_id: r!.id });
});

test.afterAll(async () => {
  await db.from("shops").delete().eq("id", shopId);
});

test("빈 상태: 데이터 0건이어도 샵 화면이 모두 열린다", async ({ page }) => {
  await login(page, email);
  for (const path of ["/shop", "/shop/jobs", "/shop/customers", "/shop/settlements", "/shop/team", "/shop/instructors", "/shop/revisit", "/shop/access-logs"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await noCrash(page);
  }
  await page.goto("/shop/jobs");
  await expect(page.getByText("등록된 강습이 없습니다.")).toBeVisible();
});

test("CSV 손님 500명: 미리 보기와 등록이 30초 안에 끝나고 한 명도 빠지지 않는다", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, email);
  await page.goto("/shop/import?type=customers");
  const rows = Array.from({ length: 500 }, (_, i) => `[테스트] 대량${i + 1},010-0000-${String(i + 1).padStart(4, "0")},초급,`);
  await page.getByLabel("CSV 파일").setInputFiles(csv("손님500.csv", ["이름,휴대폰,레벨,메모", ...rows].join("\r\n")));
  const t0 = Date.now();
  await page.getByRole("button", { name: /미리 보기/ }).click();
  await expect(page.getByText("모두 500행 · 등록 500 · 건너뜀 0 · 오류 0")).toBeVisible({ timeout: 30_000 });
  await page.getByLabel(/개인정보 수집·이용/).check();
  await page.getByRole("button", { name: "손님 500명 등록" }).click();
  await expect(page.getByRole("status")).toContainText("손님 500명을 등록했습니다.", { timeout: 30_000 });
  expect(Date.now() - t0).toBeLessThan(30_000);
  const { count } = await db.from("customers").select("*", { count: "exact", head: true }).eq("shop_id", shopId);
  expect(count).toBe(500);
  // P19-3 손님 목록은 200명씩: 잘렸다는 표시와 다음 쪽
  await page.goto("/shop/customers");
  await expect(page.getByText("전체 500명 중 1~200 (1/3쪽)")).toBeVisible();
  await page.getByRole("link", { name: "다음 쪽" }).click();
  await expect(page.getByText("전체 500명 중 201~400 (2/3쪽)")).toBeVisible();
  // 한 행 더: 501행 파일은 상한으로 막는다
  await page.goto("/shop/import?type=customers");
  await page.getByLabel("CSV 파일").setInputFiles(csv("손님501.csv", ["이름,휴대폰", ...Array.from({ length: 501 }, (_, i) => `[테스트] 초과${i},010-0000-${String(i).padStart(4, "0")}`)].join("\n")));
  await page.getByRole("button", { name: /미리 보기/ }).click();
  await expect(page.getByText(/500/).first()).toBeVisible();
});

test("강습 1000건: 목록이 10초 안에 열린다", async ({ page }) => {
  test.setTimeout(120_000);
  const { data: r } = await db.from("resorts").select("id").eq("name", "하이원").single();
  const { data: sp } = await db.from("sports").select("id").eq("name", "스키").single();
  const base = Date.now() + 2 * 86400_000;
  const all = Array.from({ length: 1000 }, (_, i) => {
    const s = new Date(base + i * 3 * 3600_000);
    return { shop_id: shopId, resort_id: r!.id, sport_id: sp!.id, starts_at: s.toISOString(), ends_at: new Date(s.getTime() + 2 * 3600_000).toISOString(), lesson_type: "private", student_count: 1, status: "draft", note: `[테스트] 대량 ${i}` };
  });
  for (let i = 0; i < all.length; i += 250) expect((await db.from("jobs").insert(all.slice(i, i + 250))).error).toBeNull();
  await login(page, email);
  const t0 = Date.now();
  await page.goto("/shop/jobs");
  await expect(page.getByRole("link", { name: /\[테스트\] 대량 0 / })).toBeVisible({ timeout: 10_000 });
  expect(Date.now() - t0).toBeLessThan(10_000);
  // P19-3 쪽 나누기: 200건씩, 잘렸다는 표시와 다음 쪽
  await expect(page.getByText("전체 1,000건 중 1~200 (1/5쪽)").first()).toBeVisible();
  await page.getByRole("link", { name: "다음 쪽" }).first().click();
  await expect(page.getByText("전체 1,000건 중 201~400 (2/5쪽)").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /\[테스트\] 대량 200 / })).toBeVisible();
  await page.goto("/shop/jobs?page=5");
  await expect(page.getByRole("link", { name: /\[테스트\] 대량 999 / })).toBeVisible();
  await noCrash(page);
});

test("특수문자·HTML·이모지 이름은 글자 그대로 보이고 실행되지 않는다", async ({ page }) => {
  const name = `<img src=x onerror=alert(1)>😀 "따옴표" & 끝${"가".repeat(60)}`;
  await db.from("customers").insert({ shop_id: shopId, name, phone: "010-0000-8888" });
  let dialog = false;
  page.on("dialog", (d) => {
    dialog = true;
    void d.dismiss();
  });
  await login(page, email);
  await page.goto(`/shop/customers?q=${encodeURIComponent("010-0000-8888")}`);
  await expect(page.getByText("<img src=x onerror=alert(1)>", { exact: false }).first()).toBeVisible();
  expect(dialog).toBe(false);
  expect(await page.locator("main img[src='x']").count()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("느린 네트워크(지연 400ms·느린 대역)에서도 강습 등록 화면이 열리고 버튼이 동작한다", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "CDP 제한은 크로미움만");
  await login(page, email);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: 50_000, uploadThroughput: 20_000 });
  await page.goto("/shop/jobs/new", { timeout: 60_000 });
  await expect(page.getByRole("button", { name: "임시 저장" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "임시 저장" }).click();
  await expect(page.getByText(/날짜|골라|입력/).first()).toBeVisible({ timeout: 30_000 }); // 빈 폼 → 안내
});

test("로그아웃 뒤 뒤로 가기로 손님 연락처를 다시 볼 수 없다", async ({ page }) => {
  await login(page, "shop1@winter.test");
  await page.goto("/shop/customers");
  await expect(page.getByText("010-0000-1001").first()).toBeVisible();
  await page.getByRole("button", { name: "로그아웃" }).first().click();
  await page.waitForURL(/\/login|\/$/);
  await page.goBack();
  // 브라우저가 지난 화면을 그대로 띄우는지 기록 (bfcache). 새로 불러오면 반드시 로그인으로 가야 한다
  await expect(page.getByText("010-0000-1001")).toHaveCount(0); // 지난 화면이 메모리에서 다시 뜨지 않는다 (P18-4 수정)
  // 뒤로 간 화면은 서버가 로그인으로 다시 보낸다. 그 이동이 끝난 뒤 새로고침한다(도중에 하면 ERR_ABORTED, P20 CI에서 발견)
  await expect(page).toHaveURL(/\/login/);
  await page.waitForLoadState("load");
  await page.reload();
  await expect(page.getByText("010-0000-1001")).toHaveCount(0);
  await expect(page).toHaveURL(/\/login/);
});
