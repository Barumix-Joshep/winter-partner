// P22-7 AI 상담 본사 지표: 3달 전(한국 시간) 달에 고정 데이터를 넣고 /admin/ai에서 그 달을 고르면 카드 숫자가 맞다.
// 손님 메시지 내용·연락처는 화면에 나오지 않는다. 샵 관리자는 /admin/ai에 못 들어간다. 데스크톱·390px에서 가로 넘침 없음.
// 다른 테스트에 영향이 없게 [테스트] 샵을 새로 만들고 끝나면 지운다.
import { expect, test, type Page } from "@playwright/test";
import { admin, as } from "./helpers";

const SHOP_NAME = "[테스트] 상담 지표 샵";
const SECRET_TEXT = "[테스트] 지표 손님 010-0000-7001";
const KST = 9 * 3600_000;

// 지금부터 3달 전 한국 시간 달 ("YYYY-MM")
function monthAgo(n: number) {
  const d = new Date(Date.now() + KST);
  const t = d.getUTCFullYear() * 12 + d.getUTCMonth() - n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
const MONTH = monthAgo(3);
const at = (day: string, hms: string) => new Date(`${MONTH}-${day}T${hms}+09:00`).toISOString();
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

let shopId = "";

test.beforeAll(async () => {
  const db = admin();
  await db.from("shops").delete().eq("name", SHOP_NAME);
  const { data: shop, error } = await db.from("shops").insert({ name: SHOP_NAME, status: "approved" }).select("id").single();
  if (error) throw error;
  shopId = shop.id;
  const { data: ch } = await db.from("shop_channels").insert({ shop_id: shopId, channel: "kakao", external_id: "bot-e2e-metrics", enabled: true }).select("id").single();
  const { data: convs } = await db
    .from("conversations")
    .insert([
      { shop_id: shopId, channel: "kakao", channel_id: ch!.id, external_user_hash: "1".repeat(64) },
      { shop_id: shopId, channel: "kakao", channel_id: ch!.id, external_user_hash: "2".repeat(64) },
    ])
    .select("id");
  const [a, b] = convs!.map((c) => c.id as string);
  const msg = (conversation_id: string, role: string, sent_at: string, delivery_status: string) => ({
    conversation_id, shop_id: shopId, channel: "kakao", role, text: SECRET_TEXT, sent_at, delivery_status,
  });
  // A: 자동응답(30초) → 다음 질문은 사장님 연결(system) + 문의. B: 사장님이 90초 뒤 답장
  const { data: msgs, error: me } = await db
    .from("messages")
    .insert([
      msg(a, "customer", at("10", "10:00:00"), "skipped"),
      msg(a, "ai", at("10", "10:00:30"), "sent"),
      msg(a, "customer", at("10", "10:05:00"), "skipped"),
      msg(a, "system", at("10", "10:05:10"), "sent"),
      msg(b, "customer", at("12", "09:00:00"), "skipped"),
      msg(b, "owner", at("12", "09:01:30"), "sent"),
    ])
    .select("id, role");
  if (me) throw me;
  const aiMsg = msgs!.find((m) => m.role === "ai")!.id;
  await db.from("inquiries").insert({ shop_id: shopId, channel: "kakao", conversation_id: a, type: "booking", created_at: at("10", "10:05:10") });
  await db.from("ai_feedback").insert({ message_id: aiMsg, shop_id: shopId, kind: "wrong", created_at: at("11", "09:00:00") });
  await db.from("ai_usage").insert([
    { shop_id: shopId, feature: "consult", model: "mock", cost_krw: 1.7, ok: true, created_at: at("10", "10:00:10") },
    { shop_id: shopId, feature: "consult", model: "mock", cost_krw: 1.7, ok: true, created_at: at("10", "10:05:05") },
  ]);
});

test.afterAll(async () => {
  await admin().from("shops").delete().eq("name", SHOP_NAME);
});

test("본사는 고른 달의 AI 상담 지표 카드를 본다 (숫자만)", async ({ browser }) => {
  const boss = await as(browser, "admin@winter.test");
  await boss.setViewportSize({ width: 1280, height: 800 });
  await boss.goto("/admin/ai");
  const section = boss.getByRole("region", { name: "AI 상담 지표" });
  await expect(section).toBeVisible();
  await section.getByLabel("기간").selectOption(MONTH);
  await section.getByRole("button", { name: "보기" }).click();
  await expect(boss).toHaveURL(new RegExp(`month=${MONTH}`));

  await expect(section.getByText("자동응답률", { exact: true }).locator("..")).toContainText("33%");
  await expect(section.getByText("손님 메시지 3건 중 1건")).toBeVisible();
  await expect(section.getByText("에스컬레이션률", { exact: true }).locator("..")).toContainText("50%");
  await expect(section.getByText("대화 2개 중 1개")).toBeVisible();
  await expect(section.getByText("평균 첫 응답 시간", { exact: true }).locator("..")).toContainText("1분");
  await expect(section.getByText("중앙값 1분 · 응답한 대화 2/2개")).toBeVisible();
  await expect(section.getByText("틀림 피드백", { exact: true }).locator("..")).toContainText("1건");
  const row = section.getByRole("row").filter({ hasText: SHOP_NAME });
  await expect(row).toContainText("2회");
  await expect(row).toContainText("3원");
  await expect(row).toContainText("2/300회");

  const text = await boss.locator("main").innerText();
  expect(text).not.toContain("지표 손님");
  expect(text).not.toContain("010-0000-7001");
  expect(await noOverflow(boss)).toBe(true);

  await boss.setViewportSize({ width: 390, height: 844 });
  await boss.reload();
  await expect(section.getByText("손님 메시지 3건 중 1건")).toBeVisible();
  expect(await noOverflow(boss)).toBe(true);
});

test("데이터가 없는 달은 — 로 보인다", async ({ browser }) => {
  const boss = await as(browser, "admin@winter.test");
  await boss.goto(`/admin/ai?month=${monthAgo(11)}`);
  const section = boss.getByRole("region", { name: "AI 상담 지표" });
  await expect(section.getByText("자동응답률", { exact: true }).locator("..")).toContainText("—");
  await expect(section).not.toContainText("NaN");
  await expect(section.getByText("이 기간 AI 상담 호출이 없습니다.")).toBeVisible();
});

test("샵 관리자는 본사 AI 화면에 못 들어간다", async ({ browser }) => {
  const shop = await as(browser, "shop1@winter.test");
  await shop.goto("/admin/ai");
  await expect(shop).not.toHaveURL(/\/admin/);
});
