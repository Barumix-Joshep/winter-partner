// 보안 1(세션 관리): 앱 쪽 유휴 자동 로그아웃. 본사 30분·샵 2시간·강사 7일 동안 조작이 없으면 이 기기 세션을 끊는다.
// 시계를 앞으로 돌려(page.clock) 기다리지 않고 확인한다.
import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

const IDLE_KEY = "wp:last-active";

// 화면이 뜨고 유휴 감시가 첫 조작 시각을 남길 때까지 기다린다 (그 전에 시계를 돌리면 감시가 아직 없다)
async function open(page: Page, path: string) {
  await page.goto(path);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), IDLE_KEY)).not.toBeNull();
}

test("샵 관리자: 2시간 조작이 없으면 로그아웃되고, 다시 들어가려면 로그인해야 한다", async ({ page }) => {
  await page.clock.install();
  await login(page, "shop1@winter.test");
  await open(page, "/shop");
  await page.clock.fastForward("02:01:00");
  await expect(page).toHaveURL(/\/login\?reason=idle/);
  await expect(page.getByText("오래 사용하지 않아 로그아웃했습니다")).toBeVisible();
  await page.goto("/shop");
  await expect(page).toHaveURL(/\/login/);
});

test("샵 관리자: 중간에 조작하면 로그인이 유지된다", async ({ page }) => {
  await page.clock.install();
  await login(page, "shop1@winter.test");
  await open(page, "/shop");
  await page.clock.fastForward("01:30:00");
  await page.mouse.move(100, 200);
  await page.keyboard.press("Shift");
  await page.clock.fastForward("01:00:00");
  await expect(page).toHaveURL(/\/shop$/);
});

test("본사 관리자는 30분 기준", async ({ page }) => {
  await page.clock.install();
  await login(page, "admin@winter.test");
  await open(page, "/admin");
  await page.clock.fastForward("00:31:00");
  await expect(page).toHaveURL(/\/login\?reason=idle/);
});

test("강사는 2시간 쉬어도 로그인이 유지된다 (기준 7일)", async ({ page }) => {
  await page.clock.install();
  await login(page, "kim@winter.test");
  await open(page, "/instructor");
  await page.clock.fastForward("02:01:00");
  await expect(page).toHaveURL(/\/instructor$/);
});

test("오래 닫아 뒀던 화면을 다시 열면 로그아웃된다 (마지막 조작 시각은 탭끼리 공유)", async ({ page }) => {
  await login(page, "shop1@winter.test");
  await open(page, "/shop");
  await page.evaluate((key) => {
    const v = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(key, JSON.stringify({ ...v, at: Date.now() - 3 * 60 * 60 * 1000 }));
  }, IDLE_KEY);
  await page.reload();
  await expect(page).toHaveURL(/\/login\?reason=idle/);
});
