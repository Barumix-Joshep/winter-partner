import { expect, test, type Browser, type Page } from "@playwright/test";
import { admin, as, createJob, kstDate, moveJobToPast, addAvailability, userClient } from "./helpers";
import { setAiFeatures } from "./ai";

// P15-4 가상 데이터 시범 운영 리허설 (로컬, AI는 가짜 모델).
// 샵 2(렌탈·강습팀), 강사 6(렌탈 전속 2·팀 전속 1·프리랜서 3), 손님 10 → 한 시즌 흐름을 처음부터 끝까지.
test.describe.configure({ mode: "serial" });

const PW = "winter1234"; // 로컬 전용 (시드와 같은 규칙)
const D = "rehearsal.test";
const ACC = {
  rental: { email: `rh-rental@${D}`, role: "shop_admin", name: "[테스트] 리허설 렌탈 사장" },
  team: { email: `rh-team@${D}`, role: "shop_admin", name: "[테스트] 리허설 팀장" },
  ex1: { email: `rh-ex1@${D}`, role: "instructor", name: "[테스트] 전속하나" },
  ex2: { email: `rh-ex2@${D}`, role: "instructor", name: "[테스트] 전속둘" },
  ex3: { email: `rh-ex3@${D}`, role: "instructor", name: "[테스트] 팀원셋" },
  fr1: { email: `rh-fr1@${D}`, role: "instructor", name: "[테스트] 프리하나" },
  fr2: { email: `rh-fr2@${D}`, role: "instructor", name: "[테스트] 프리둘" },
  fr3: { email: `rh-fr3@${D}`, role: "instructor", name: "[테스트] 프리셋" },
} as const;
type Who = keyof typeof ACC;

const S: { rental?: string; team?: string; uid: Partial<Record<Who, string>>; inst: Partial<Record<Who, string>>; jobs: Record<string, string> } = { uid: {}, inst: {}, jobs: {} };
const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const login = (browser: Browser, who: Who) => asEmail(browser, ACC[who].email);
async function asEmail(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(PW);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return page;
}
const jobByNote = async (note: string) => (await admin().from("jobs").select("id").eq("note", note).single()).data!.id as string;

test.beforeAll(async () => {
  const db = admin();
  for (const [k, a] of Object.entries(ACC) as [Who, (typeof ACC)[Who]][]) {
    const { data, error } = await db.auth.admin.createUser({ email: a.email, password: PW, email_confirm: true, user_metadata: { role: a.role, name: a.name, agreed: true } });
    if (error) throw error;
    S.uid[k] = data.user.id;
  }
  const resort = (await db.from("resorts").select("id").eq("name", "하이원").single()).data!.id;
  const ski = (await db.from("sports").select("id").eq("name", "스키").single()).data!.id;
  for (const [key, name, type, owner] of [["rental", "[테스트] 리허설 렌탈", "rental_shop", "rental"], ["team", "[테스트] 리허설 강습팀", "lesson_team", "team"]] as const) {
    const { data } = await db.from("shops").insert({ name, type, status: "approved", business_no: "000-00-80000", owner_name: ACC[owner].name, created_by: S.uid[owner] }).select("id").single();
    S[key] = data!.id;
    await db.from("shop_members").upsert({ shop_id: data!.id, user_id: S.uid[owner], is_owner: true });
    await db.from("shop_resorts").insert({ shop_id: data!.id, resort_id: resort });
  }
  for (const k of ["ex1", "ex2", "ex3", "fr1", "fr2", "fr3"] as const) {
    S.inst[k] = (await db.from("instructors").select("id").eq("user_id", S.uid[k]).single()).data!.id;
    await db.from("instructors").update({ base_rate: 80000 }).eq("id", S.inst[k]);
    await db.from("instructor_sports").insert({ instructor_id: S.inst[k], sport_id: ski });
    await db.from("instructor_resorts").insert({ instructor_id: S.inst[k], resort_id: resort });
  }
  await db.from("shop_instructors").insert([
    { shop_id: S.rental, instructor_id: S.inst.ex1 },
    { shop_id: S.rental, instructor_id: S.inst.ex2 },
    { shop_id: S.team, instructor_id: S.inst.ex3 },
  ]);
  await db.from("customers").insert(
    Array.from({ length: 10 }, (_, i) => ({ shop_id: S.rental, name: `[테스트] 손님${String(i + 1).padStart(2, "0")}`, phone: `010-0000-80${String(i + 1).padStart(2, "0")}`, level: "초급" })),
  );
  await setAiFeatures(true, ["intake", "bid_assist"]);
});
test.afterAll(async () => setAiFeatures(false, ["intake", "bid_assist"]));

test("1. 접수 문자 붙여넣기 → 직접 의뢰 → 전속 강사 수락", async ({ browser }) => {
  const date = kstDate(50);
  await addAvailability(S.inst.ex1!, date);
  const shop = await login(browser, "rental");
  await shop.goto("/shop/jobs/new");
  await shop.getByLabel("문자·카톡 붙여넣기").fill(`[테스트] ${md(date)} 오전 10시 스키 1:1 부탁드려요. 초급입니다. 010-0000-8001`);
  await shop.getByRole("button", { name: "자동 입력" }).click();
  await expect(shop.getByRole("status")).toContainText("칸을 채웠습니다");
  await expect(shop.getByLabel("날짜", { exact: true })).toHaveValue(date);
  await shop.getByLabel("기존 손님").selectOption({ label: "[테스트] 손님01 (초급)" });
  await shop.getByLabel(/요청 사항/).fill("[테스트] R1 접수 강습");
  await shop.getByLabel(/강사 지급액/).fill("80000");
  await shop.getByRole("button", { name: "임시 저장" }).click();
  await shop.waitForURL(/\/shop\/jobs$/);
  S.jobs.r1 = await jobByNote("[테스트] R1 접수 강습");
  await shop.goto(`/shop/jobs/${S.jobs.r1}`);
  await shop.getByRole("listitem").filter({ hasText: "[테스트] 전속하나" }).getByRole("button", { name: "의뢰 보내기" }).click();
  const ex1 = await login(browser, "ex1");
  await ex1.goto("/instructor");
  await ex1.locator("section").filter({ hasText: "[테스트] R1 접수 강습" }).getByRole("button", { name: "수락" }).click();
  await expect(ex1.getByRole("status")).toContainText("의뢰를 수락했습니다");
});

test("2. 입찰 공고(전속 비공개) → 프리랜서·팀 입찰 → AI 선정 보조 → 팀 선정 → 팀원 지정", async ({ browser }) => {
  const shop = await login(browser, "rental");
  S.jobs.r2 = await createJob(shop, { date: kstDate(52), customer: "[테스트] 입찰 손님", phone: "010-0000-8101", rate: 100000, note: "[테스트] R2 입찰 강습" });
  await shop.getByLabel("강습팀 입찰도 받기").check();
  await shop.getByRole("button", { name: "입찰 공고 올리기" }).click();
  await expect(shop.getByRole("heading", { name: "입찰 현황" })).toBeVisible();

  const ex2 = await login(browser, "ex2");
  await ex2.goto("/instructor/bids");
  await expect(ex2.getByText("전속 강사는 입찰 공고를 볼 수 없습니다.")).toBeVisible();
  for (const [who, amount] of [["fr1", "90000"], ["fr2", "85000"]] as const) {
    const p = await login(browser, who);
    await p.goto("/instructor/bids");
    const card = p.getByRole("listitem").filter({ hasText: "[테스트] R2 입찰 강습" });
    await card.getByLabel("제시 금액").fill(amount);
    await card.getByRole("button", { name: "금액 제시" }).click();
    await expect(card.getByText("입찰함")).toBeVisible();
  }
  const team = await login(browser, "team");
  await team.goto("/shop/team-bids");
  const post = team.getByRole("listitem").filter({ hasText: "[테스트] R2 입찰 강습" });
  await post.getByLabel("팀 제시 금액").fill("95000");
  await post.getByRole("button", { name: "팀으로 입찰" }).click();
  await expect(post.getByText("입찰함")).toBeVisible();

  await shop.reload();
  await shop.getByRole("button", { name: "AI 추천 보기" }).click();
  await expect(shop.getByRole("status")).toContainText("추천:");
  await shop.getByRole("listitem").filter({ hasText: "[테스트] 리허설 강습팀 (팀)" }).getByRole("button", { name: "선정" }).click();
  await expect(shop.getByText("배정: [테스트] 리허설 강습팀 (팀) · 팀원 지정 전")).toBeVisible();
  // 선정 뒤 입찰 현황은 "입찰 없음"이 아니라 결과를 보여 준다 (리허설 캡처에서 발견)
  await expect(shop.getByText(/선정: \[테스트\] 리허설 강습팀 \(팀\) · 95,000원 제시 · 입찰 3건 마감/)).toBeVisible();
  await expect(shop.getByText("아직 입찰이 없습니다.")).toHaveCount(0);
  await team.goto("/shop/team-bids");
  const lesson = team.getByRole("listitem").filter({ hasText: "[테스트] R2 입찰 강습" }).filter({ hasText: "팀원 지정 필요" });
  await lesson.getByLabel("맡을 팀원").selectOption({ label: "[테스트] 팀원셋" });
  await lesson.getByRole("button", { name: "팀원 지정" }).click();
  await expect(team.getByText("맡은 팀원: [테스트] 팀원셋")).toBeVisible();
});

test("3. 샵 간 일정 충돌, 강사 일방 취소와 패널티, 손님 취소", async ({ browser }) => {
  const date = kstDate(54);
  await addAvailability(S.inst.fr1!, date);
  await addAvailability(S.inst.fr2!, kstDate(56));
  const shop = await login(browser, "rental");
  S.jobs.r3 = await createJob(shop, { date, customer: "[테스트] 충돌 손님", phone: "010-0000-8102", rate: 80000, note: "[테스트] R3 프리 강습" });
  await shop.getByRole("listitem").filter({ hasText: "[테스트] 프리하나" }).getByRole("button", { name: "의뢰 보내기" }).click();
  const fr1 = await login(browser, "fr1");
  await fr1.goto("/instructor");
  await fr1.locator("section").filter({ hasText: "[테스트] R3 프리 강습" }).getByRole("button", { name: "수락" }).click();
  await expect(fr1.getByRole("status")).toContainText("의뢰를 수락했습니다");

  // 다른 샵(시드 하이원 스노우렌탈)이 같은 시간에 의뢰 → 의뢰는 가지만 수락은 막힌다
  const other = await as(browser, "shop1@winter.test");
  const otherJob = await createJob(other, { date, customer: "[테스트] 옆샵 손님", phone: "010-0000-8103", rate: 80000, note: "[테스트] 옆샵 같은 시간" });
  const cand = other.getByRole("listitem").filter({ hasText: "[테스트] 프리하나" });
  if ((await cand.count()) > 0) {
    await cand.getByRole("button", { name: "의뢰 보내기" }).click();
    await fr1.goto("/instructor");
    await fr1.locator("section").filter({ hasText: "[테스트] 옆샵 같은 시간" }).getByRole("button", { name: "수락" }).click();
    await expect(fr1.getByRole("alert")).toContainText("같은 시간에 다른 강습이 있어 수락할 수 없습니다");
  } else {
    // 이미 확정된 시간은 강사 찾기 후보에서 빠진다 (충돌을 미리 막음)
    await expect(cand).toHaveCount(0);
  }
  expect(otherJob).toBeTruthy();

  // 강사 일방 취소 → 패널티
  S.jobs.r4 = await createJob(shop, { date: kstDate(56), customer: "[테스트] 취소 손님", phone: "010-0000-8104", rate: 80000, note: "[테스트] R4 강사 취소" });
  await shop.getByRole("listitem").filter({ hasText: "[테스트] 프리둘" }).getByRole("button", { name: "의뢰 보내기" }).click();
  const fr2 = await login(browser, "fr2");
  await fr2.goto("/instructor");
  await fr2.locator("section").filter({ hasText: "[테스트] R4 강사 취소" }).getByRole("button", { name: "수락" }).click();
  await fr2.goto(`/instructor/schedule?week=${kstDate(56)}`);
  const li = fr2.getByRole("listitem").filter({ hasText: "[테스트] 리허설 렌탈" });
  await li.getByRole("button", { name: "이 강습 취소" }).click();
  await li.getByPlaceholder("사유").fill("[테스트] 개인 사정");
  await li.getByRole("button", { name: "취소 확정" }).click();
  await expect(fr2.getByRole("status")).toContainText("패널티 1점");
  const { data: pen } = await admin().from("instructor_penalties").select("points").eq("instructor_id", S.inst.fr2!);
  expect(pen).toEqual([{ points: 1 }]);

  // 손님 취소
  S.jobs.r5 = await createJob(shop, { date: kstDate(58), customer: "[테스트] 손님 취소", phone: "010-0000-8105", rate: 80000, note: "[테스트] R5 손님 취소" });
  await shop.getByRole("button", { name: "강습 취소…" }).click();
  await shop.getByLabel("손님 취소").check();
  await shop.getByRole("button", { name: "강습 취소", exact: true }).click();
  await expect(shop.getByText("취소", { exact: true })).toBeVisible();
});

test("4. 완료 보고 → 승인 → 월 정산(3.3%·팀 0%) → PDF·Excel → 지급 완료", async ({ browser }) => {
  // 강사가 모두 달라 겹치지 않는다. 3시간 전으로 옮겨 이번 달 정산에 들어가게 한다(월초에 며칠 전으로 옮기면 지난달로 넘어간다)
  const reports: [string, Who, number][] = [[S.jobs.r1, "ex1", 3], [S.jobs.r2, "ex3", 3], [S.jobs.r3, "fr1", 3]];
  const shop = await login(browser, "rental");
  for (const [jobId, who, hours] of reports) {
    await moveJobToPast(jobId, hours);
    const p = await login(browser, who);
    await p.goto("/instructor");
    const card = p.locator("article").filter({ has: p.getByRole("button", { name: "완료 보고하기" }) }).first();
    await card.getByLabel("강습 노트").fill("[테스트] 플루그보겐 진행, 다음엔 연속 턴");
    await card.getByRole("button", { name: "완료 보고하기" }).click();
    await expect(p.getByRole("status")).toContainText("완료 보고했습니다");
    await shop.goto(`/shop/jobs/${jobId}`);
    await shop.getByRole("button", { name: "승인" }).click();
    await expect(shop.getByText("승인했습니다.")).toBeVisible();
  }
  await shop.goto("/shop/settlements");
  await shop.getByRole("button", { name: /이 달 정산 집계|다시 집계/ }).click();
  const row = (name: string) => shop.getByRole("listitem").filter({ hasText: name }).first();
  await expect(row("[테스트] 전속하나")).toContainText("원천세 2,640원"); // 80,000 × 3.3% = 2,640
  await expect(row("[테스트] 프리하나")).toContainText("실지급 77,360원");
  await expect(row("[테스트] 리허설 강습팀 (팀)")).toContainText("원천세 0원");
  await shop.getByRole("button", { name: "정산서 발행" }).click();
  await expect(row("[테스트] 전속하나")).toContainText("정산서 발행");
  // 팀 강습 승인 알림: 팀원에게는 금액 없이, 팀장에게 금액 (P12-3 회귀)
  const { data: nt } = await admin().from("notifications").select("kind, payload, user_id").contains("payload", { job_id: S.jobs.r2 }).in("kind", ["lesson_approved", "team_lesson_approved"]);
  expect(nt!.find((n) => n.kind === "lesson_approved" && n.user_id === S.uid.ex3)?.payload).toEqual({ job_id: S.jobs.r2, team: true });
  expect(nt!.find((n) => n.kind === "team_lesson_approved" && n.user_id === S.uid.team)?.payload).toMatchObject({ amount: 95000 });

  const { data: st } = await admin().from("settlements").select("id, instructor_id").eq("shop_id", S.rental!);
  const ex1St = st!.find((x) => x.instructor_id === S.inst.ex1)!.id;
  const pdf = await shop.request.get(`/settlements/${ex1St}/pdf`);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  const month = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7);
  const xlsx = await shop.request.get(`/shop/settlements/export?month=${month}`);
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");

  await row("[테스트] 전속하나").locator("summary").click();
  await row("[테스트] 전속하나").getByRole("button", { name: /송금했어요/ }).click();
  await expect(row("[테스트] 전속하나")).toContainText("지급 완료");
});

test("5. 알림 확인과 읽음 처리", async ({ browser }) => {
  const ex1 = await login(browser, "ex1");
  await ex1.goto("/notifications");
  await expect(ex1.getByRole("listitem").first()).toBeVisible();
  await expect(ex1.getByText(/읽지 않은 알림 [1-9]\d*개/)).toBeVisible();
  await ex1.getByRole("button", { name: "모두 읽음" }).click();
  await expect(ex1.getByText("읽지 않은 알림 0개")).toBeVisible();
  await ex1.goto("/instructor");
  await expect(ex1.getByRole("link", { name: /읽지 않음/ })).toHaveCount(0);
});

test("6. 보호자 동의 링크, 삭제(익명화) 요청, 연락처 열람 기록", async ({ browser }) => {
  const shop = await login(browser, "rental");
  await shop.goto("/shop/customers?new=1");
  await shop.getByLabel("이름", { exact: true }).fill("[테스트] 어린이손님");
  await shop.getByLabel("출생 연도 (선택)").fill(String(new Date().getFullYear() - 8));
  await shop.getByLabel(/^보호자/).first().fill("[테스트] 보호자");
  await shop.getByLabel("보호자 연락처").fill("010-0000-8201");
  await shop.getByRole("button", { name: "손님 등록" }).click();
  await shop.getByRole("button", { name: "보호자 동의 링크 만들기" }).click();
  const url = await shop.getByLabel("동의 링크").inputValue();
  const g = await (await browser.newContext()).newPage();
  await g.goto(url);
  await g.getByLabel(/시즌 안내·할인 소식/).check();
  await g.getByLabel(/법정대리인/).check();
  await g.getByRole("button", { name: "선택 저장" }).click();
  await expect(g.getByRole("status")).toContainText("선택을 저장했습니다");
  await shop.reload();
  await expect(shop.getByText(/동의 \(보호자 · 링크/)).toBeVisible();

  const { data: c10 } = await admin().from("customers").select("id").eq("name", "[테스트] 손님10").single();
  await shop.goto(`/shop/customers?id=${c10!.id}`);
  await shop.getByRole("button", { name: "손님 정보 삭제 요청 처리…" }).click();
  await shop.getByLabel(/익명화.*입력해 주세요/).fill("익명화");
  await shop.getByRole("button", { name: "익명화", exact: true }).click();
  await expect(shop.getByText(/익명화된 손님입니다/)).toBeVisible();

  await shop.goto("/shop/access-logs");
  await expect(shop.getByRole("cell", { name: "손님 연락처 열람" }).first()).toBeVisible();
  await expect(shop.getByRole("cell", { name: "[테스트] 리허설 렌탈 사장" }).first()).toBeVisible();
});

test("7. 샵 간 격리 (화면·직접 조회·권한 우회 시도)", async ({ browser }) => {
  const other = await as(browser, "shop1@winter.test");
  await other.goto(`/shop/jobs/${S.jobs.r1}`);
  await expect(other.getByText(/could not be found|찾을 수 없/)).toBeVisible();
  await expect(other.getByText("[테스트] R1 접수 강습")).toHaveCount(0);
  const c = await userClient("shop1@winter.test");
  for (const table of ["customers", "jobs", "settlements", "customer_contacts", "customer_consents", "access_logs"] as const) {
    const { data } = await c.from(table).select("shop_id").eq("shop_id", S.rental!);
    expect(data ?? [], table).toEqual([]);
  }
  // 권한 우회 시도: 남의 샵 손님 수정·강습 등록·정산 지급 표시
  const { data: upd } = await c.from("customers").update({ memo: "침입" }).eq("shop_id", S.rental!).select("id");
  expect(upd ?? []).toEqual([]);
  const { error: rpcErr } = await c.rpc("create_job", {
    p_shop_id: S.rental, p_resort_id: 1, p_sport_id: 1, p_starts: new Date().toISOString(), p_ends: new Date().toISOString(),
    p_lesson_type: "private", p_student_count: 1, p_customer_price: null, p_instructor_rate: 1, p_patch_paid_by: null, p_note: null, p_customer_id: null, p_new_customer: null,
  });
  expect(rpcErr?.code).toBe("42501");
  const { data: st } = await admin().from("settlements").select("id").eq("shop_id", S.rental!).limit(1).single();
  const { error: paidErr } = await c.rpc("set_settlement_paid", { p_settlement_id: st!.id, p_paid: true });
  expect(paidErr).not.toBeNull();
  // 팀(다른 샵)도 렌탈샵 손님 연락처를 못 본다
  const t = await userClient(ACC.team.email.replace("@rehearsal.test", "@rehearsal.test"));
  const { data: tc } = await t.from("customers").select("phone").eq("shop_id", S.rental!);
  expect(tc ?? []).toEqual([]);
});

test("8. 모바일(390px) 주요 화면 — 가로 넘침 없음, 캡처", async ({ browser }) => {
  test.setTimeout(240_000); // 화면 14개를 networkidle까지 기다린다 (전체 실행 중 개발 서버가 느릴 때 90초를 넘었다)
  const shots: [Who, string[]][] = [
    ["rental", ["/shop", "/shop/jobs", `/shop/jobs/${S.jobs.r2}`, "/shop/customers", "/shop/settlements", "/shop/register-qr", "/shop/ai"]],
    ["ex1", ["/instructor", "/instructor/schedule", "/instructor/pay", "/instructor/profile", "/notifications"]],
    ["fr3", ["/instructor/bids"]],
    ["team", ["/shop/team-bids"]],
  ];
  const wide: string[] = [];
  for (const [who, paths] of shots) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    await p.goto("/login");
    await p.getByLabel("이메일").fill(ACC[who].email);
    await p.getByLabel("비밀번호").fill(PW);
    await p.getByRole("button", { name: "로그인" }).click();
    await p.waitForURL((u) => !u.pathname.startsWith("/login"));
    for (const path of paths) {
      await p.goto(path);
      await p.waitForLoadState("networkidle");
      const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (over > 1) wide.push(`${path} +${over}px`);
      await p.screenshot({ path: `test-results/rehearsal-mobile/${who}${path.replace(/[/?=]/g, "_")}.png`, fullPage: true });
    }
    await ctx.close();
  }
  expect(wide).toEqual([]);
});

// 사용 안내(/help) 화면 캡처: HELP_CAPTURE=1 npx playwright test e2e/rehearsal.spec.ts
// [테스트] 리허설 데이터로만 찍는다 (실제 개인정보 없음). 결과는 public/help/*.png
test("9. 사용 안내 캡처 ([테스트] 데이터)", async ({ browser }) => {
  test.skip(process.env.HELP_CAPTURE !== "1", "HELP_CAPTURE=1일 때만");
  const shots: [Who, string, string][] = [
    ["rental", "/shop", "shop-today"],
    ["rental", "/shop/jobs/new", "shop-new-job"],
    ["rental", `/shop/jobs/${S.jobs.r2}`, "shop-job-bids"],
    ["rental", "/shop/settlements", "shop-settlements"],
    ["rental", "/shop/customers", "shop-customers"],
    ["ex1", "/instructor", "inst-home"],
    ["fr3", "/instructor/bids", "inst-bids"],
    ["ex1", "/instructor/schedule", "inst-schedule"],
    ["ex1", "/instructor/pay", "inst-pay"],
    ["ex1", "/notifications", "notifications"],
  ];
  const ctxs = new Map<Who, Awaited<ReturnType<typeof browser.newContext>>>();
  for (const [who, path, name] of shots) {
    if (!ctxs.has(who)) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const p = await ctx.newPage();
      await p.goto("/login");
      await p.getByLabel("이메일").fill(ACC[who].email);
      await p.getByLabel("비밀번호").fill(PW);
      await p.getByRole("button", { name: "로그인" }).click();
      await p.waitForURL((u) => !u.pathname.startsWith("/login"));
      ctxs.set(who, ctx);
    }
    const p = ctxs.get(who)!.pages()[0];
    await p.goto(path);
    await p.waitForLoadState("networkidle");
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" }); // 개발 도구 버튼 숨김
    await p.screenshot({ path: `public/help/${name}.png` });
  }
  for (const c of ctxs.values()) await c.close();
});
