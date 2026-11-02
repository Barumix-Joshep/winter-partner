import { expect, test } from "@playwright/test";
import { as, report, usageSince } from "./helpers";

// P15-1 운영 실호출 연결: 테스트 샵의 AI 설정 → 접수 문자 1건 자동 입력(실제 API) → ai_usage에 호출·토큰·비용 기록
test("접수 문자 1건 실호출과 사용량 기록", async ({ browser }) => {
  const since = new Date().toISOString();
  const shop = await as(browser, "test-rental");

  await shop.goto("/shop/ai");
  await expect(shop.getByText("지금은 AI 서비스가 연결되지 않아")).toHaveCount(0); // 키가 연결됨
  await expect(shop.getByRole("button", { name: "강습 접수 자동 입력 끄기" })).toBeVisible(); // 켜져 있음

  await shop.goto("/shop/jobs/new");
  await shop.getByLabel("문자·카톡 붙여넣기").fill("[테스트] 안녕하세요 12월 20일 오전 10시 스키 1:2 강습 예약하고 싶어요. 둘 다 초급이에요. 연락처 010-0000-9100");
  const t0 = Date.now();
  await shop.getByRole("button", { name: "자동 입력" }).click();
  await expect(shop.getByRole("status").or(shop.getByRole("alert")).first()).toBeVisible();
  const ms = Date.now() - t0;
  await expect(shop.getByRole("status")).toContainText("칸을 채웠습니다");
  const v = {
    date: await shop.getByLabel("날짜", { exact: true }).inputValue(),
    start: await shop.getByLabel("시작", { exact: true }).inputValue(),
    end: await shop.getByLabel("끝", { exact: true }).inputValue(),
    type: await shop.getByLabel("강습 유형").inputValue(),
    count: await shop.getByLabel("인원").inputValue(),
    level: await shop.getByLabel("레벨", { exact: true }).inputValue(),
  };
  expect(v).toMatchObject({ date: "2026-12-20", start: "10:00", end: "12:00", type: "semi", count: "2", level: "초급" });

  const rows = await usageSince(since, "intake");
  report("P15-1 intake", { ms, rows });
  expect(rows.length).toBeGreaterThanOrEqual(1);
  const r = rows[rows.length - 1];
  expect(r.ok).toBe(true);
  expect(r.model).toBe("claude-haiku-5-5");
  // 단가 대조: Haiku 입력 145원·출력 725원 / 100만 토큰
  const expected = (r.input_tokens * 145 + r.output_tokens * 725) / 1_000_000;
  expect(Math.abs(Number(r.cost_krw) - expected)).toBeLessThan(0.02);
});
