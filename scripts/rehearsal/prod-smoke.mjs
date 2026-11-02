#!/usr/bin/env node
// P18-5 운영 스모크: [테스트] 계정으로 로그인·읽기만 확인 + 실제 AI 접수 해석 몇 번 (저장하지 않는다).
// 390px로 주요 화면을 열어 오류·가로 넘침을 본다. 비밀번호는 환경변수에서만 읽고 출력하지 않는다.
// 실행: node --env-file=.env.local --env-file=.env.rehearsal.local scripts/rehearsal/prod-smoke.mjs
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const U = process.env.SMOKE_URL ?? "https://winter-partner.vercel.app";
const PW = process.env.REHEARSAL_PASSWORD;
const MAX_AI = Number(process.env.SMOKE_MAX_AI ?? 6);
if (!PW) throw new Error("REHEARSAL_PASSWORD가 필요합니다");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const aiCount = async () => (await db.from("ai_usage").select("*", { count: "exact", head: true })).count;

const SCREENS = {
  "test-rental": ["/shop", "/shop/jobs", "/shop/customers", "/shop/instructors", "/shop/settlements", "/shop/team", "/help"],
  "test-team": ["/shop", "/shop/team-bids", "/shop/team"],
  "test-inst1": ["/instructor", "/instructor/bids", "/instructor/schedule", "/instructor/pay", "/instructor/profile"],
  "test-inst2": ["/instructor", "/instructor/bids"],
  "test-inst3": ["/instructor", "/instructor/schedule"],
  "test-inst4": ["/instructor", "/instructor/bids"],
};
const INTAKE = [
  "토요일 오전 10시 스키 1:1 강습 처음이에요",
  "다음 주 일요일 오후 1시 보드 2명 초급",
  "12월 20일 오전 11시 스노스케이트 체험 3명",
  "snowboard lesson 12/27 2pm, 1 person intermediate",
];

const b = await chromium.launch();
const results = [];
const before = await aiCount();
for (const [acct, paths] of Object.entries(SCREENS)) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(U + "/login");
  await p.getByRole("textbox", { name: "이메일" }).fill(`${acct}@winter-partner.test`);
  await p.getByLabel("비밀번호").fill(PW);
  await p.getByRole("button", { name: "로그인" }).click();
  try {
    await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  } catch {
    results.push({ acct, path: "/login", ok: false, why: "로그인 실패" });
    await ctx.close();
    continue;
  }
  for (const path of paths) {
    const res = await p.goto(U + path);
    await p.locator("main").first().waitFor({ timeout: 20000 }).catch(() => {});
    const crash = await p.getByText(/Application error|문제가 생겼습니다|server-side exception/).count();
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    results.push({ acct, path, ok: (res?.status() ?? 0) < 400 && crash === 0 && overflow <= 1, status: res?.status(), overflow });
  }
  if (acct === "test-rental") {
    await p.goto(U + "/shop/jobs/new");
    const paste = p.getByLabel("문자·카톡 붙여넣기");
    if (await paste.count()) {
      for (const text of INTAKE.slice(0, MAX_AI)) {
        await p.reload();
        await paste.fill(text);
        await p.getByRole("button", { name: "자동 입력" }).click();
        const st = p.getByRole("status").filter({ hasText: /채웠|못|없|많/ }).first();
        await st.waitFor({ timeout: 60000 }).catch(() => {});
        const sel = p.locator('select[name="sport_id"]');
        results.push({
          acct, path: `AI: ${text}`, ok: /채웠/.test((await st.innerText().catch(() => "")) ?? ""),
          sport: await sel.evaluate((e) => e.options[e.selectedIndex]?.text ?? ""),
          date: await p.getByLabel("날짜", { exact: true }).inputValue(),
          count: await p.getByLabel("인원").inputValue(),
        });
      }
    } else results.push({ acct, path: "AI", ok: false, why: "붙여넣기 칸 없음 (AI 꺼짐)" });
  }
  await ctx.close();
}
await b.close();
const aiCalls = (await aiCount()) - before;
console.log(JSON.stringify({ aiCalls, failed: results.filter((r) => !r.ok), results }, null, 1));
