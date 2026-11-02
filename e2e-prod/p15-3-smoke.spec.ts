import { expect, test } from "@playwright/test";
import { as, prodDb, report, usageSince } from "./helpers";

// P15-3 기능별 실호출 스모크 (운영, 테스트 샵 가상 데이터). 각 항목: 성공·지연·비용·출력 품질을 남긴다.
test.describe.configure({ mode: "serial" });

const cost = (rows: { cost_krw: unknown }[]) => Math.round(rows.reduce((a, r) => a + Number(r.cost_krw), 0) * 100) / 100;
const id = async (table: string, col: string, val: string) => {
  const { data, error } = await prodDb().from(table).select("id").eq(col, val).single();
  if (error) throw error;
  return data.id as string;
};

test("A3 입찰 선정 보조", async ({ browser }) => {
  const since = new Date().toISOString();
  const jobId = await id("jobs", "note", "[테스트] 입찰 공고 · 어린이 둘 처음");
  const shop = await as(browser, "test-rental");
  await shop.goto(`/shop/jobs/${jobId}`);
  const t0 = Date.now();
  await shop.getByRole("button", { name: "AI 추천 보기" }).click();
  const status = shop.getByRole("status").filter({ hasText: "추천:" });
  await expect(status.or(shop.getByText("추천을 만들지 못했습니다"))).toBeVisible({ timeout: 60_000 });
  const ms = Date.now() - t0;
  const text = (await shop.locator("div.border-\\[\\#BFD0F7\\]").first().innerText()).replace(/\s+/g, " ");
  await expect(status).toBeVisible();
  // 이름은 화면에서 되돌려져 있고, 가명(강사1·팀1)은 남지 않는다
  expect(text).toMatch(/추천: \[테스트\] (강사가|강사나|하이원 강습팀 \(팀\))/);
  expect(text).not.toMatch(/강사\d|팀\d/);
  // 규칙 경고: 상한(15만)의 절반 미만 금액(6만)
  expect(text).toContain("상한의 절반 미만 금액");
  await shop.getByRole("button", { name: "추천대로 선택" }).click();
  await expect(shop.getByText(/^배정:/)).toHaveCount(0); // 선정은 사장님이
  const u = await usageSince(since, "bid_assist");
  report("A3", { ms, calls: u.length, ok: u.every((r) => r.ok), model: u[0]?.model, tokens: u.map((r) => [r.input_tokens, r.output_tokens]), cost: cost(u), text });
});

test("A4 손님 카드 요약 (광고 동의 있음·없음)", async ({ browser }) => {
  const since = new Date().toISOString();
  const shop = await as(browser, "test-rental");
  const out: Record<string, unknown> = {};
  for (const [name, consent] of [["[테스트] 손님일", false], ["[테스트] 손님이", true]] as const) {
    const cid = await id("customers", "name", name);
    const t0 = Date.now();
    await shop.goto(`/shop/customers?id=${cid}`);
    const box = shop.getByRole("status").filter({ hasText: "다음 강습 제안" });
    await expect(box).toBeVisible({ timeout: 60_000 });
    const text = (await box.innerText()).replace(/\s+/g, " ");
    expect(text).not.toMatch(/손님[A-Z]|010-0000-/); // 가명·연락처가 화면에 남지 않는다
    if (consent) await expect(box.getByRole("textbox")).toBeVisible();
    else await expect(box).toContainText("광고 수신 동의가 유효한 손님에게만");
    out[name] = { ms: Date.now() - t0, text };
  }
  const u = await usageSince(since, "customer_summary");
  report("A4", { ...out, calls: u.length, ok: u.every((r) => r.ok), cost: cost(u) });
});

test("C1 재방문 후보와 문구", async ({ browser }) => {
  const since = new Date().toISOString();
  const shop = await as(browser, "test-rental");
  await shop.goto("/shop/revisit");
  await expect(shop.getByRole("listitem").filter({ hasText: "[테스트] 손님이" })).toBeVisible();
  await expect(shop.getByRole("listitem").filter({ hasText: "[테스트] 손님일" })).toHaveCount(0);
  await expect(shop.getByRole("listitem").filter({ hasText: "[테스트] 손님삼" })).toHaveCount(0);
  const t0 = Date.now();
  await shop.getByRole("button", { name: "안내 문구 초안 만들기" }).click();
  const draft = shop.getByRole("listitem").filter({ hasText: "[테스트] 손님이" }).getByRole("textbox");
  await expect(draft).toBeVisible({ timeout: 60_000 });
  const text = await draft.inputValue();
  expect(text).toContain("[테스트] 손님이");
  expect(text).not.toMatch(/손님\d/);
  const u = await usageSince(since, "revisit");
  report("C1", { ms: Date.now() - t0, calls: u.length, ok: u.every((r) => r.ok), cost: cost(u), text });
});

test("B1 수업 메모 정리 + D2 건강정보 2차 감지", async ({ browser }) => {
  const since = new Date().toISOString();
  const jobId = await id("jobs", "note", "[테스트] 보고 대기 강습");
  const inst = await as(browser, "test-inst3");
  await inst.goto("/instructor");
  const card = inst.locator("article").filter({ has: inst.getByRole("button", { name: "완료 보고하기" }) }).first();
  await card.getByLabel("강습 노트").fill("[테스트] 장비 착용하고 평지 걷기 연습, 넘어지고 일어서기 잘함. 내려오다 넘어져서 손목이 아프다고 함. 다음엔 리프트 타기");
  const t0 = Date.now();
  await card.getByRole("button", { name: "정리하기" }).click();
  await expect(card.getByRole("status").or(card.getByText("정리하지 못했습니다"))).toBeVisible({ timeout: 60_000 });
  const tidyMs = Date.now() - t0;
  const tidied = await card.getByLabel("강습 노트").inputValue();
  expect(tidied).toMatch(/^진도: .+\n잘된 점: .+\n다음 과제: .+/);
  const healthAlert = (await card.getByRole("alert").allInnerTexts()).join(" ");
  // 정리본에서 빠진 건강 문장을 강사가 그대로 다시 적어 보고 → 단어 검사(1차) 통과, AI(2차)가 경고, 저장은 된다
  await card.getByLabel("강습 노트").fill(`${tidied}\n내려오다 넘어져서 손목을 다쳤다고 함`);
  await card.getByRole("button", { name: "완료 보고하기" }).click();
  await expect(inst.getByRole("status")).toContainText(/완료 보고했습니다/, { timeout: 60_000 });
  const { data: job } = await prodDb().from("jobs").select("status").eq("id", jobId).single();
  expect(job?.status).toBe("done");
  const { data: hw } = await prodDb().from("health_warnings").select("terms").eq("job_id", jobId);
  const u = [...(await usageSince(since, "note_tidy")), ...(await usageSince(since, "health_check"))];
  report("B1/D2", { tidyMs, tidied, healthAlert, warnings: hw, calls: u.length, ok: u.every((r) => r.ok), cost: cost(u) });
  expect((hw ?? []).flatMap((h) => h.terms as string[]).some((t) => t.startsWith("AI:"))).toBe(true);
});
