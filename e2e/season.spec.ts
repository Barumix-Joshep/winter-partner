// P18-5 한 시즌 종합 재현 (방해 포함): [테스트] 샵 2곳(렌탈·강습팀), 강사 6명, 손님 10명, 종목 3개.
// 방해: 종목이 안 맞는 의뢰, 강사 일방 취소, 샵 취소, 마감 임박 입찰, 정산 중 승인 추가, 발행 뒤 승인(이월), 웹푸시 구독 없음(알림 미수신).
// 흐름은 각 계정 권한으로 RPC를 부르고, 화면은 390px로 열어 가로 넘침을 확인·캡처한다.
import { expect, test, type Browser } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PASSWORD, admin, login, userClient } from "./helpers";

test.describe.configure({ mode: "serial" });
const db = admin();
const tag = Date.now();
const mail = (k: string) => `season-${k}-${tag}@winter.test`;
const DAY = 86400_000;
const SHIFT = 60 * DAY; // 의뢰·입찰은 앞날짜로 받고, 끝난 뒤 2026년 10월로 옮겨 완료·정산한다
const oct = (d: number, h = 10) => new Date(Date.UTC(2026, 9, d, h - 9)); // KST
const S: {
  users: Record<string, string>; inst: Record<string, string>; rental: string; team: string; jobs: Record<string, string>; c: Record<string, SupabaseClient>;
} = { users: {}, inst: {}, rental: "", team: "", jobs: {}, c: {} };
const sport = async (n: string) => (await db.from("sports").select("id").eq("name", n).single()).data!.id as number;
const ok = <T,>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data as T;
};

test.beforeAll(async () => {
  test.setTimeout(120_000);
  const resort = (await db.from("resorts").select("id").eq("name", "하이원").single()).data!.id;
  const people: [string, string, string][] = [
    ["rental", "shop_admin", "[테스트] 시즌 렌탈 사장"], ["team", "shop_admin", "[테스트] 시즌 팀장"],
    ["i1", "instructor", "[테스트] 시즌 스키"], ["i2", "instructor", "[테스트] 시즌 보드"], ["i3", "instructor", "[테스트] 시즌 스키보드"],
    ["i4", "instructor", "[테스트] 시즌 스케이트"], ["i5", "instructor", "[테스트] 시즌 팀원스키"], ["i6", "instructor", "[테스트] 시즌 팀원보드"],
  ];
  for (const [k, role, name] of people) {
    const { data } = await db.auth.admin.createUser({ email: mail(k), password: PASSWORD, email_confirm: true, user_metadata: { role, name, agreed: true } });
    S.users[k] = data.user!.id;
  }
  S.rental = ok<{ id: string }>(await db.from("shops").insert({ name: "[테스트] 시즌 렌탈", type: "rental_shop", status: "approved", created_by: S.users.rental }).select("id").single(), "shop").id;
  S.team = ok<{ id: string }>(await db.from("shops").insert({ name: "[테스트] 시즌 강습팀", type: "lesson_team", status: "approved", created_by: S.users.team }).select("id").single(), "team").id;
  for (const [shop, user] of [[S.rental, S.users.rental], [S.team, S.users.team]]) {
    await db.from("shop_members").upsert({ shop_id: shop, user_id: user, is_owner: true });
    await db.from("shop_resorts").insert({ shop_id: shop, resort_id: resort });
  }
  const [ski, board, skate] = [await sport("스키"), await sport("스노우보드"), await sport("스노우스케이트")];
  const sportsOf: Record<string, number[]> = { i1: [ski], i2: [board], i3: [ski, board], i4: [skate, board], i5: [ski], i6: [board] };
  for (const k of Object.keys(sportsOf)) {
    S.inst[k] = (await db.from("instructors").select("id").eq("user_id", S.users[k]).single()).data!.id;
    await db.from("instructors").update({ base_rate: 80000, bio: "[테스트] 시즌 강사", cert_status: "approved" }).eq("id", S.inst[k]);
    for (const s of sportsOf[k]) await db.from("instructor_sports").insert({ instructor_id: S.inst[k], sport_id: s });
    await db.from("instructor_resorts").insert({ instructor_id: S.inst[k], resort_id: resort });
  }
  for (const k of ["i5", "i6"]) await db.from("shop_instructors").insert({ shop_id: S.team, instructor_id: S.inst[k] });
  const customers = Array.from({ length: 10 }, (_, i) => ({ shop_id: S.rental, name: `[테스트] 시즌손님${i + 1}`, phone: `010-0000-6${String(i).padStart(3, "0")}`, level: ["입문", "초급", "중급"][i % 3] }));
  const cust = ok(await db.from("customers").insert(customers).select("id"), "customers") as { id: string }[];

  // 강습 (앞날짜): J4·J5는 같은 가족(부모 스키·아이 스노우보드)을 종목별로 따로 등록
  const jobs: [string, number, string, number, number, number][] = [
    // key, 종목, 유형, 인원, 10월 일, 강사 지급액
    ["J1", ski, "private", 1, 3, 80000], ["J2", board, "semi", 2, 4, 120000], ["J3", skate, "group", 3, 5, 150000],
    ["J4", ski, "private", 1, 6, 80000], ["J5", board, "private", 1, 6, 90000], ["J6", ski, "private", 1, 7, 80000],
    ["J7", board, "semi", 2, 9, 120000], ["J8", board, "group", 4, 8, 200000],
  ];
  for (const [i, [k, sp, lt, n, d, rate]] of jobs.entries()) {
    const starts = new Date(oct(d).getTime() + SHIFT);
    S.jobs[k] = ok<{ id: string }>(await db.from("jobs").insert({
      shop_id: S.rental, resort_id: resort, sport_id: sp, starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + 2 * 3600_000).toISOString(),
      lesson_type: lt, student_count: n, instructor_rate: rate, status: "draft", assign_mode: "direct", note: `[테스트] 시즌 ${k}`,
    }).select("id").single(), k).id;
    await db.from("job_customers").insert({ job_id: S.jobs[k], customer_id: cust[i].id });
  }
  for (const k of ["rental", "team", "i1", "i2", "i3", "i4", "i5", "i6"]) S.c[k] = await userClient(mail(k));
});

test.afterAll(async () => {
  await db.from("shops").delete().in("id", [S.rental, S.team]);
  for (const id of Object.values(S.users)) await db.auth.admin.deleteUser(id);
});

const offerAccept = async (job: string, who: string) => {
  const offer = ok(await S.c.rental.rpc("send_job_offer", { p_job_id: S.jobs[job], p_instructor_id: S.inst[who] }), `offer ${job}`);
  ok(await S.c[who].rpc("respond_job_offer", { p_offer_id: offer, p_accept: true }), `accept ${job}`);
};

test("1. 직접 의뢰: 종목이 안 맞으면 막히고, 혼합 가족은 종목별로 따로 배정", async () => {
  const wrong = await S.c.rental.rpc("send_job_offer", { p_job_id: S.jobs.J3, p_instructor_id: S.inst.i1 });
  expect(wrong.error?.message).toContain("이 종목을 하지 않는 강사입니다");
  await offerAccept("J1", "i1");
  await offerAccept("J2", "i2");
  await offerAccept("J3", "i4");
  await offerAccept("J4", "i3"); // 부모 스키
  await offerAccept("J5", "i2"); // 아이 스노우보드 (같은 시간, 다른 강사)
  await offerAccept("J6", "i1");
  await offerAccept("J7", "i3");
});

test("2. 방해: 강사 일방 취소(패널티) → 다른 강사 재배정, 샵 취소(정산 제외)", async () => {
  ok(await S.c.i1.rpc("instructor_cancel", { p_job_id: S.jobs.J6, p_reason: "[테스트] 개인 사정" }), "instructor_cancel");
  const pen = await db.from("instructor_penalties").select("points").eq("instructor_id", S.inst.i1).eq("job_id", S.jobs.J6);
  expect(pen.data).toHaveLength(1);
  await offerAccept("J6", "i3");
  ok(await S.c.rental.rpc("cancel_job", { p_job_id: S.jobs.J7, p_by: "shop", p_reason: "[테스트] 기상 악화" }), "cancel_job");
  const n = await db.from("notifications").select("payload").eq("user_id", S.users.i3).eq("kind", "job_canceled");
  expect(n.data?.some((x) => (x.payload as { by: string }).by === "shop")).toBe(true);
});

test("3. 방해: 마감 임박 입찰 — 마감 전 입찰은 받고, 마감 뒤 입찰은 막고, 팀 선정 뒤 팀원 종목 확인", async () => {
  const closes = new Date(Date.now() + 4000).toISOString();
  ok(await S.c.rental.rpc("publish_bid_job", { p_job_id: S.jobs.J8, p_closes_at: closes, p_allow_team: true }), "publish");
  ok(await S.c.i4.rpc("place_bid", { p_job_id: S.jobs.J8, p_amount: 190000, p_memo: "[테스트] 보드 그룹 가능" }), "bid i4");
  const tb = ok(await S.c.team.rpc("place_team_bid", { p_job_id: S.jobs.J8, p_amount: 180000, p_memo: "[테스트] 팀 2명" }), "team bid");
  const over = await S.c.i3.rpc("place_bid", { p_job_id: S.jobs.J8, p_amount: 250000, p_memo: null });
  expect(over.error).not.toBeNull(); // 상한(200,000) 초과
  await expect.poll(() => Date.now() > Date.parse(closes) + 500, { timeout: 10_000 }).toBe(true);
  const late = await S.c.i2.rpc("place_bid", { p_job_id: S.jobs.J8, p_amount: 170000, p_memo: null });
  expect(late.error?.message).toContain("마감");
  ok(await S.c.rental.rpc("select_bid", { p_bid_id: tb, p_final_rate: 180000 }), "select team");
  const wrongMember = await S.c.team.rpc("assign_team_instructor", { p_job_id: S.jobs.J8, p_instructor_id: S.inst.i5 });
  expect(wrongMember.error?.message).toContain("이 종목을 하지 않는 강사입니다");
  ok(await S.c.team.rpc("assign_team_instructor", { p_job_id: S.jobs.J8, p_instructor_id: S.inst.i6 }), "assign i6");
  // 팀원에게 팀 확정 금액이 보이지 않는다
  const seen = await S.c.i6.from("instructor_assignments").select("final_rate").eq("job_id", S.jobs.J8).single();
  expect(seen.data?.final_rate).toBeNull();
});

test("4. 시즌이 끝나 10월로 옮긴 뒤 완료 보고·승인, 정산 중 승인 추가, 발행 뒤 승인은 11월로 이월", async () => {
  for (const id of Object.values(S.jobs)) {
    const { data: j } = await db.from("jobs").select("starts_at, ends_at").eq("id", id).single();
    await db.from("jobs").update({ starts_at: new Date(Date.parse(j!.starts_at) - SHIFT).toISOString(), ends_at: new Date(Date.parse(j!.ends_at) - SHIFT).toISOString() }).eq("id", id);
  }
  const who: Record<string, string> = { J1: "i1", J2: "i2", J3: "i4", J4: "i3", J5: "i2", J6: "i3", J8: "i6" };
  for (const [j, k] of Object.entries(who)) ok(await S.c[k].rpc("complete_lesson", { p_job_id: S.jobs[j], p_note: `[테스트] ${j} 진도` }), `complete ${j}`);
  for (const j of ["J1", "J3", "J4", "J6", "J8"]) ok(await S.c.rental.rpc("approve_lesson", { p_job_id: S.jobs[j], p_score: 5, p_memo: null }), `approve ${j}`);

  const month = "2026-10-01";
  expect(ok(await S.c.rental.rpc("generate_settlements", { p_shop_id: S.rental, p_month: month }), "gen")).toBe(4);
  // 정산 중 수정: draft 상태에서 J2가 승인되면 다시 집계에 들어간다
  ok(await S.c.rental.rpc("approve_lesson", { p_job_id: S.jobs.J2, p_score: 4, p_memo: null }), "approve J2");
  expect(ok(await S.c.rental.rpc("generate_settlements", { p_shop_id: S.rental, p_month: month }), "regen")).toBe(5);
  const rows = ok(await S.c.rental.from("settlements").select("instructor_id, payee_shop_id, gross, withholding, net").eq("month", month), "rows") as { instructor_id: string | null; payee_shop_id: string | null; gross: number; withholding: number; net: number }[];
  const by = (k: string) => rows.find((r) => r.instructor_id === S.inst[k]);
  expect(by("i1")).toMatchObject({ gross: 80000, withholding: 2640, net: 77360 }); // J6은 일방 취소로 빠짐
  expect(by("i3")).toMatchObject({ gross: 160000, withholding: 5280 }); // J4 + 재배정된 J6, 샵 취소 J7 제외
  expect(by("i2")).toMatchObject({ gross: 120000, withholding: 3960 }); // J2만 (J5는 아직 승인 전)
  expect(by("i4")).toMatchObject({ gross: 150000, withholding: 4950 });
  expect(rows.find((r) => r.payee_shop_id === S.team)).toMatchObject({ gross: 180000, withholding: 0, net: 180000 });
  expect(rows.reduce((s, r) => s + r.gross, 0)).toBe(80000 + 160000 + 120000 + 150000 + 180000);

  expect(ok(await S.c.rental.rpc("issue_settlements", { p_shop_id: S.rental, p_month: month }), "issue")).toBe(5);
  ok(await S.c.rental.rpc("approve_lesson", { p_job_id: S.jobs.J5, p_score: 5, p_memo: null }), "approve J5 late");
  await S.c.rental.rpc("generate_settlements", { p_shop_id: S.rental, p_month: month });
  expect((await db.from("settlements").select("gross").eq("shop_id", S.rental).eq("month", month).eq("instructor_id", S.inst.i2).single()).data!.gross).toBe(120000);
  ok(await S.c.rental.rpc("generate_settlements", { p_shop_id: S.rental, p_month: "2026-11-01" }), "gen nov");
  expect((await db.from("settlements").select("gross, withholding").eq("shop_id", S.rental).eq("month", "2026-11-01").eq("instructor_id", S.inst.i2).single()).data).toEqual({ gross: 90000, withholding: 2970 });
});

test("5. 방해: 웹푸시 구독이 없어도(알림 미수신) 지급 완료 알림은 알림 목록에 남는다", async ({ browser }) => {
  const { data: st } = await db.from("settlements").select("id").eq("shop_id", S.rental).eq("month", "2026-10-01").eq("instructor_id", S.inst.i1).single();
  ok(await S.c.rental.rpc("set_settlement_paid", { p_settlement_id: st!.id, p_paid: true }), "paid");
  expect((await db.from("push_subscriptions").select("*", { count: "exact", head: true }).eq("user_id", S.users.i1)).count).toBe(0);
  const page = await mobile(browser, "i1");
  await page.goto("/notifications");
  await expect(page.getByText("정산금이 지급됐습니다").first()).toBeVisible();
});

async function mobile(browser: Browser, who: string) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await login(page, mail(who));
  return page;
}

test("6. 모바일 390px: 샵·강사·팀 주요 화면 — 가로 넘침 없음, 버튼이 화면 밖으로 나가지 않음, 캡처", async ({ browser }) => {
  test.setTimeout(180_000);
  const screens: [string, string[]][] = [
    ["rental", ["/shop", "/shop/jobs", `/shop/jobs/${S.jobs.J8}`, "/shop/settlements?month=2026-10", "/shop/customers", "/shop/instructors"]],
    ["team", ["/shop/team-bids", "/shop/team"]],
    ["i3", ["/instructor", "/instructor/schedule", "/instructor/pay?month=2026-10", "/instructor/profile"]],
    ["i6", ["/instructor/schedule", "/instructor/pay?month=2026-10"]],
  ];
  const problems: string[] = [];
  for (const [who, paths] of screens) {
    const page = await mobile(browser, who);
    for (const p of paths) {
      await page.goto(p);
      await page.locator("main").waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) problems.push(`${who} ${p}: 가로 넘침 ${overflow}px`);
      const outside = await page.evaluate(() =>
        [...document.querySelectorAll("main button, main a")].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
        }).map((el) => (el.textContent ?? "").trim().slice(0, 20)),
      );
      if (outside.length) problems.push(`${who} ${p}: 화면 밖 버튼 ${outside.join(", ")}`);
      await page.screenshot({ path: `test-results/season-mobile/${who}${p.replace(/[/?=]/g, "_")}.png`, fullPage: true });
    }
    // 팀원 화면에 팀 확정 금액(180,000)이 보이지 않는다
    if (who === "i6") await expect(page.getByText("180,000")).toHaveCount(0);
  }
  expect(problems).toEqual([]);
});
