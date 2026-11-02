import { expect, test } from "@playwright/test";
import { admin, as } from "./helpers";

// P16-2 서버 오류가 한 시간에 기준 이상 쌓이면 본사 관리자에게 알림, 운영 상태 화면에서 확인
test("서버 오류가 쌓이면 본사에 알림이 가고 운영 상태에 보인다", async ({ browser }) => {
  const db = admin();
  for (let i = 0; i < 5; i++) {
    const { error } = await db.rpc("record_ops_event", { p_kind: "server_error", p_source: "GET /e2e/[id] (render)", p_detail: `E2E 오류 ${i}`, p_ok: false });
    expect(error).toBeNull();
  }
  await db.rpc("record_ops_event", { p_kind: "cron_run", p_source: "/api/notify/dispatch", p_detail: '{"sent":0}', p_ok: true });

  const boss = await as(browser, "admin@winter.test");
  await boss.goto("/admin/ops");
  await expect(boss.getByText("GET /e2e/[id] (render)").first()).toBeVisible();
  await expect(boss.getByRole("listitem").filter({ hasText: "놓친 알림 다시 보내기" })).toContainText("성공");
  await boss.goto("/notifications");
  await expect(boss.getByText("서버 오류가 늘었습니다").first()).toBeVisible();

  const shop = await as(browser, "shop1@winter.test");
  await shop.goto("/admin/ops");
  await expect(shop).not.toHaveURL(/\/admin/);
});
