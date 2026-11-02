import { expect, test } from "@playwright/test";
import fixtures from "../src/lib/ai/__fixtures__/intake-samples.json";
import { as, report, usageSince } from "./helpers";

// P15-2 접수 자동 입력 정확도 — 가상 샘플 20개, 운영 서버 실호출(오늘 기준).
// 상대 날짜 문자는 오늘(한국 날짜) 기준 정답으로 채점한다 (정답 자체를 바꾸는 것이 아니라 기준일만 바꾼다).
// 고정 기준일(2026-12-01) 평가는 로컬 npm run ai:eval (키 필요).
const today = new Date(Date.now() + 9 * 3600_000);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const plus = (n: number) => ymd(new Date(today.getTime() + n * 86400_000));
const dow = today.getUTCDay(); // 0=일
const toWeekday = (target: number, nextWeek: boolean) => {
  // 한 주는 월~일. 이번 주 X요일 = 이번 주 안의 그 요일, 다음 주 = 그 다음 주
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const idx = target === 0 ? 6 : target - 1;
  return plus(mondayOffset + idx + (nextWeek ? 7 : 0));
};
const RELATIVE: [RegExp, () => string][] = [
  [/이번 주 토요일/, () => toWeekday(6, false)],
  [/이번 주 일요일/, () => toWeekday(0, false)],
  [/이번 주 금요일/, () => toWeekday(5, false)],
  [/다음 주 일요일/, () => toWeekday(0, true)],
  [/다음 주 토요일/, () => toWeekday(6, true)],
  [/내일/, () => plus(1)],
  [/모레/, () => plus(2)],
];

test("가상 샘플 20개 (오늘 기준, 운영 실호출)", async ({ browser }) => {
  test.setTimeout(900_000);
  const since = new Date().toISOString();
  const shop = await as(browser, "test-rental");
  const rows: Record<string, unknown>[] = [];
  let ok = 0;
  for (const [i, s] of fixtures.samples.entries()) {
    const rel = RELATIVE.find(([re]) => re.test(s.text));
    const want = { ...s.expected, date: rel ? rel[1]() : s.expected.date };
    await shop.goto("/shop/jobs/new");
    await shop.getByLabel("문자·카톡 붙여넣기").fill(s.text);
    const t0 = Date.now();
    await shop.getByRole("button", { name: "자동 입력" }).click();
    await expect(shop.getByRole("status").filter({ hasText: "칸을 채웠습니다" }).or(shop.getByRole("alert").filter({ hasText: /읽지 못했|쓸 수 없|연락처를 지우지/ }))).toBeVisible();
    const ms = Date.now() - t0;
    const got = {
      date: await shop.getByLabel("날짜", { exact: true }).inputValue(),
      start: await shop.getByLabel("시작", { exact: true }).inputValue(),
      end: await shop.getByLabel("끝", { exact: true }).inputValue(),
      sport: await shop.getByLabel("종목").evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.text ?? ""),
      count: Number(await shop.getByLabel("인원").inputValue()),
    };
    const pass = got.date === want.date && got.start === want.start && got.end === want.end && got.sport === want.sport && got.count === want.studentCount;
    if (pass) ok++;
    rows.push({ i: i + 1, pass, ms, rel: !!rel, want: { date: want.date, start: want.start, end: want.end, sport: want.sport, count: want.studentCount }, got });
  }
  const usage = await usageSince(since, "intake");
  report("P15-2 today", { ok, total: fixtures.samples.length, calls: usage.length, failedCalls: usage.filter((u) => !u.ok).length, cost: usage.reduce((a, u) => a + Number(u.cost_krw), 0) });
  for (const r of rows) if (!r.pass) report("P15-2 miss", r);
  report("P15-2 latency", { avgMs: Math.round(rows.reduce((a, r) => a + (r.ms as number), 0) / rows.length), maxMs: Math.max(...rows.map((r) => r.ms as number)) });
  expect(ok / fixtures.samples.length).toBeGreaterThanOrEqual(0.9);
});
