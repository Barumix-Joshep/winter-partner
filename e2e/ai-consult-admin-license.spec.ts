// P23-3 본사 AI 상담 사용권 관리 화면 (/admin/ai/consult).
// 본사가 [테스트] 샵에 체험 부여 → 체험 대기 → 연장 → 팩 추가 → 포함량·하루 상한 → 중지(화면 안 두 번 확인) → 이력,
// 다른 [테스트] 샵에 날짜 지정 체험 → 유료 전환, RPC 오류는 한국어로, 새 요금제, 샵 관리자는 못 들어옴, 390px 가로 넘침 없음.
// 켜짐 스위치(consult_license_required)는 건드리지 않는다(본사 RPC는 스위치와 상관없이 동작). 로컬 DB에만 쓰고 끝나면 모두 지운다.
import { expect, test, type Page } from "@playwright/test";
import { admin, as, kstDate } from "./helpers";

const SHOP_A = "[테스트] 사용권 관리 샵";
const SHOP_B = "[테스트] 사용권 날짜 샵";
const PLAN_CODE = "e2e_plan_p23_3";
const URL = "/admin/ai/consult";
let a = "";
let b = "";
let packSize = 0;
let boss: Page;

test.describe.configure({ mode: "serial" });

const row = (page: Page, id: string) => page.locator(`tr[data-shop="${id}"]`);
const manage = (page: Page) => page.locator("#manage");
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function cleanup() {
  const db = admin();
  const { data: shops } = await db.from("shops").select("id").in("name", [SHOP_A, SHOP_B]);
  for (const s of shops ?? []) {
    await db.from("consult_usage_packs").delete().eq("shop_id", s.id);
    await db.from("consult_licenses").delete().eq("shop_id", s.id);
    await db.from("notifications").delete().eq("payload->>shop_id", s.id);
    await db.from("shops").delete().eq("id", s.id);
  }
  await db.from("consult_plans").delete().eq("code", PLAN_CODE);
}

// 화면을 열고 그 샵의 관리 칸을 연다
async function openManage(page: Page, id: string, name: string) {
  await page.goto(URL);
  await row(page, id).getByRole("link", { name: `${name} 관리` }).click();
  await expect(manage(page).getByRole("heading", { name })).toBeVisible();
}

test.beforeAll(async ({ browser }) => {
  await cleanup();
  const db = admin();
  const { data, error } = await db.from("shops").insert([{ name: SHOP_A, status: "approved" }, { name: SHOP_B, status: "approved" }]).select("id, name");
  if (error) throw error;
  a = data.find((s) => s.name === SHOP_A)!.id;
  b = data.find((s) => s.name === SHOP_B)!.id;
  const { data: plan } = await db.from("consult_plans").select("pack_size").eq("active", true).order("created_at", { ascending: false }).limit(1).single();
  packSize = plan!.pack_size;
  boss = await as(browser, "admin@winter.test");
  await boss.setViewportSize({ width: 1280, height: 900 });
});

test.afterAll(async () => {
  await boss?.context().close();
  await cleanup();
});

test("본사 화면에서 사용권 표로 간다, 사용권 없는 샵도 한 줄", async () => {
  await boss.goto("/admin/ai");
  await boss.getByRole("link", { name: "AI 상담 사용권 관리" }).click();
  await expect(boss).toHaveURL(/\/admin\/ai\/consult/);
  await expect(boss.getByRole("heading", { name: "AI 상담 사용권" })).toBeVisible();
  await expect(row(boss, a)).toContainText("사용권 없음");
  await expect(boss.getByRole("region", { name: "요금제" })).toContainText("부가세");
});

test("체험 부여(첫 자동응답 기준) → 체험 대기", async () => {
  await openManage(boss, a, SHOP_A);
  const form = manage(boss).getByRole("form", { name: "체험 부여" });
  await expect(form.getByLabel("첫 자동응답이 나간 때부터 (기본)")).toBeChecked();
  await form.getByLabel(/본사 메모/).fill("[테스트] 시범 체험");
  await form.getByRole("button", { name: "체험 부여" }).click();
  await expect(row(boss, a)).toContainText("체험 대기");
  await expect(row(boss, a)).toContainText("대기 끝");
  await expect(manage(boss)).toContainText("[테스트] 시범 체험"); // 본사 메모는 본사 화면에만
  await expect(manage(boss).getByRole("list", { name: "사용권 이력" })).toContainText("체험 부여");
  // 이미 사용권이 있으면 부여 칸 대신 연장·유료 전환 등이 보인다
  await expect(manage(boss).getByRole("form", { name: "체험 부여" })).toHaveCount(0);
  await expect(manage(boss).getByRole("form", { name: "연장" })).toBeVisible();
});

test("연장 → 체험(새 종료일, 남은 일수)", async () => {
  const end = kstDate(20);
  const form = manage(boss).getByRole("form", { name: "연장" });
  await form.getByLabel("새 종료일 (마지막 날 포함)").fill(end);
  await form.getByRole("button", { name: "연장" }).click();
  await expect(form.getByRole("status")).toHaveText("연장했습니다.");
  await expect(row(boss, a)).toContainText(end);
  await expect(row(boss, a)).toContainText("21일"); // 오늘 포함
  await expect(row(boss, a).locator("span", { hasText: /^체험$/ })).toBeVisible();
});

test("팩 추가 → 한도에 더해진다", async () => {
  const form = manage(boss).getByRole("form", { name: "팩 추가" });
  await form.getByLabel("팩 수").fill("2");
  await form.getByRole("button", { name: "팩 추가" }).click();
  await expect(form.getByRole("status")).toHaveText("팩을 추가했습니다.");
  await expect(row(boss, a)).toContainText(`팩 +${(packSize * 2).toLocaleString("ko-KR")}`);
});

test("포함량·하루 상한 조정", async () => {
  const form = manage(boss).getByRole("form", { name: "포함량·하루 상한" });
  await form.getByLabel("월 포함 응답 (건)").fill("500");
  await form.getByLabel(/하루 상한/).fill("50");
  await form.getByRole("button", { name: "포함량·상한 저장" }).click();
  await expect(form.getByRole("status")).toHaveText("포함량·하루 상한을 바꿨습니다.");
  await expect(row(boss, a)).toContainText(`0 / ${(500 + packSize * 2).toLocaleString("ko-KR")}`);
  await expect(row(boss, a)).toContainText("0 / 50");
});

test("중지: 화면 안에서 한 번 더 확인해야 중지된다 → 중지 · 미납", async () => {
  const form = manage(boss).getByRole("form", { name: "중지" });
  await form.getByLabel("중지 이유").selectOption("unpaid");
  await expect(async () => {
    await form.getByRole("button", { name: "중지…" }).click({ timeout: 2000 });
    await expect(form.getByRole("group", { name: "중지 확인" })).toBeVisible({ timeout: 2000 });
  }).toPass();
  await form.getByRole("button", { name: "취소" }).click(); // 취소하면 아무 일 없음
  await expect(form.getByRole("group", { name: "중지 확인" })).toHaveCount(0);
  await expect(row(boss, a)).not.toContainText("중지");
  await form.getByRole("button", { name: "중지…" }).click();
  await form.getByRole("button", { name: "중지 확정" }).click();
  await expect(row(boss, a)).toContainText("중지 · 미납");
  await expect(manage(boss).getByRole("form", { name: "중지" })).toHaveCount(0);
  await expect(manage(boss).getByRole("heading", { name: "연장하고 다시 켜기" })).toBeVisible();
});

test("이력: 부여·연장·팩·포함량·중지가 남는다", async () => {
  const list = manage(boss).getByRole("list", { name: "사용권 이력" });
  for (const t of ["체험 부여", "연장", "팩 추가", "포함량·하루 상한 변경", "중지"]) await expect(list).toContainText(t);
  await expect(list).toContainText("이유 미납");
  await expect(list).toContainText("본사 운영자");
});

test("필터: 상태 중지, 7일 안에 끝남", async () => {
  await boss.goto(`${URL}?status=suspended`);
  await expect(row(boss, a)).toBeVisible();
  await expect(row(boss, b)).toHaveCount(0);
  await boss.goto(`${URL}?status=none`);
  await expect(row(boss, b)).toBeVisible();
  await expect(row(boss, a)).toHaveCount(0);
  await boss.goto(`${URL}?soon=1`);
  await expect(row(boss, a)).toHaveCount(0); // 중지된 것은 강조하지 않는다
});

test("날짜 지정 체험 부여 → 체험 · 시작 전, 그다음 유료 전환", async () => {
  await openManage(boss, b, SHOP_B);
  const start = kstDate(3);
  const form = manage(boss).getByRole("form", { name: "체험 부여" });
  await expect(async () => {
    await form.getByLabel("날짜 지정").check({ timeout: 2000 });
    await expect(form.getByLabel("시작일")).toBeVisible({ timeout: 2000 });
  }).toPass();
  await form.getByLabel("시작일").fill(start);
  await form.getByRole("button", { name: "체험 부여" }).click();
  await expect(row(boss, b)).toContainText("체험 · 시작 전");
  await expect(row(boss, b)).toContainText(start);

  const paid = manage(boss).getByRole("form", { name: "유료 전환" });
  await paid.getByLabel("청구 시작일").fill(kstDate(0));
  await paid.getByLabel("청구 종료일 (마지막 날 포함)").fill(kstDate(30));
  await paid.getByLabel(/청구 메모/).fill("[테스트] 첫 달 일할");
  await paid.getByRole("button", { name: "유료 전환" }).click();
  await expect(paid.getByRole("status")).toHaveText("유료로 전환했습니다.");
  await expect(row(boss, b).locator("span", { hasText: /^유료$/ })).toBeVisible();
  await expect(row(boss, b)).toContainText(kstDate(30));
  await expect(manage(boss).getByRole("list", { name: "사용권 이력" })).toContainText("유료 전환");
});

test("DB가 거절하면 한국어로 이유를 보인다", async () => {
  const form = manage(boss).getByRole("form", { name: "연장" });
  await form.getByLabel("새 종료일 (마지막 날 포함)").fill(kstDate(-2));
  await form.getByRole("button", { name: "연장" }).click();
  await expect(form.getByRole("alert")).toHaveText("새 종료일은 오늘 이후로 넣어 주세요");
});

test("390px: 표는 가로 스크롤 칸 안에서, 화면 전체는 넘치지 않는다", async () => {
  await boss.setViewportSize({ width: 390, height: 844 });
  await openManage(boss, a, SHOP_A);
  expect(await noOverflow(boss)).toBe(true);
  await boss.setViewportSize({ width: 1280, height: 900 });
});

test("새 요금제: 값은 표에서 읽은 지금 요금제로 미리 채워지고, 만든 요금제가 목록에 보인다", async () => {
  await boss.goto(URL);
  const plans = boss.getByRole("region", { name: "요금제" });
  await plans.getByText("새 요금제", { exact: true }).click();
  const form = plans.getByRole("form", { name: "새 요금제" });
  await expect(form.getByLabel("팩 크기 (건)")).toHaveValue(String(packSize));
  await form.getByLabel("코드 (영문 소문자·숫자·밑줄)").fill(PLAN_CODE);
  await form.getByLabel("이름").fill("[테스트] 요금제");
  await form.getByLabel(/는 새 부여에 쓰지 않기/).uncheck(); // 다른 시험의 기본 요금제는 끄지 않는다
  await form.getByRole("button", { name: "새 요금제 만들기" }).click();
  await expect(form.getByRole("status")).toHaveText("새 요금제를 만들었습니다.");
  await expect(plans).toContainText(PLAN_CODE);
  // 같은 코드를 또 만들면 한국어 오류
  await form.getByLabel("코드 (영문 소문자·숫자·밑줄)").fill(PLAN_CODE);
  await form.getByRole("button", { name: "새 요금제 만들기" }).click();
  await expect(form.getByRole("alert")).toHaveText("이미 있는 요금제 코드입니다.");
  await admin().from("consult_plans").delete().eq("code", PLAN_CODE);
});

test("샵 관리자는 본사 사용권 화면에 못 들어간다", async ({ browser }) => {
  const shop = await as(browser, "shop1@winter.test");
  await shop.goto(URL);
  await expect(shop).not.toHaveURL(/\/admin/);
  await shop.context().close();
});
