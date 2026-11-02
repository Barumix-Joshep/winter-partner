import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { compareCert, parseCertExtract } from "../src/lib/ai/cert";
import { as, DOMAIN, prodDb, report, usageSince } from "./helpers";

// D1 자격증 판독 (운영 실호출, Sonnet 비전): 가상 자격증 2장(정상·성명 불일치)
const CERT = (name: string) => `
<div style="width:900px;height:560px;padding:40px;box-sizing:border-box;font-family:sans-serif;border:12px double #0F1E3D;background:#fff">
  <h1 style="text-align:center;margin:0 0 8px">[테스트] 스키 지도자 자격증</h1>
  <p style="text-align:center;color:#555;margin:0 0 30px">KSIA 대한스키지도자연맹 (가상 이미지 — 실제 자격증 아님)</p>
  <table style="font-size:26px;line-height:2">
    <tr><td style="width:220px">성명</td><td>${name}</td></tr>
    <tr><td>등급</td><td>Level 2</td></tr>
    <tr><td>자격번호</td><td>KS-2024-001234</td></tr>
    <tr><td>발급일</td><td>2024-03-01</td></tr>
    <tr><td>유효기간</td><td>2030-02-28</td></tr>
  </table>
</div>`;

test("가상 자격증 판독과 불일치 표시, 강사는 판독값을 못 고친다", async ({ browser }) => {
  test.setTimeout(240_000);
  const since = new Date().toISOString();
  const draw = await (await browser.newContext({ viewport: { width: 900, height: 560 } })).newPage();
  const images: Record<string, Buffer> = {};
  for (const [k, name] of [["ok", "[테스트] 강사라"], ["mismatch", "[테스트] 홍길동"]]) {
    await draw.setContent(CERT(name));
    images[k] = await draw.screenshot({ type: "png" });
  }

  const inst = await as(browser, "test-inst4");
  await inst.goto("/instructor/profile");
  await expect(inst.getByText("AI 판독 서비스(Anthropic)로 전송됩니다")).toBeVisible();
  for (const k of ["ok", "mismatch"]) {
    await inst.getByLabel("발급처").fill("KSIA");
    await inst.getByLabel("등급").fill("Level 2");
    await inst.locator('input[name="file"]').setInputFiles({ name: `cert-${k}.png`, mimeType: "image/png", buffer: images[k] });
    await inst.getByRole("button", { name: "자격증 올리기" }).click();
    await expect(inst.getByText("올렸습니다")).toBeVisible();
    await inst.reload();
  }

  // 판독은 응답 뒤(after)에 돈다 → 저장될 때까지 기다린다
  const db = prodDb();
  const { data: me } = await db.from("instructors").select("id, profiles(name)").eq("bio", "[테스트] 가상 강사").limit(10);
  const instRow = (me ?? []).find((r) => (r as unknown as { profiles: { name: string } }).profiles.name === "[테스트] 강사라")!;
  let rows: { id: string; ai_extract: unknown; created: string }[] = [];
  await expect(async () => {
    const { data } = await db.from("instructor_certs").select("id, ai_extract, file_url").eq("instructor_id", instRow.id).not("file_url", "is", null);
    rows = ((data ?? []) as { id: string; ai_extract: unknown; file_url: string }[]).map((r) => ({ id: r.id, ai_extract: r.ai_extract, created: r.file_url }));
    expect(rows.filter((r) => r.ai_extract).length).toBeGreaterThanOrEqual(2);
  }).toPass({ timeout: 120_000, intervals: [3000] });

  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const results = rows.map((r) => {
    const ex = parseCertExtract(r.ai_extract)!;
    return { holder: ex.holderName, grade: ex.grade, last4: ex.numberLast4, expires: ex.expiresOn, ...compareCert({ issuer: "KSIA", grade: "Level 2", profileName: "[테스트] 강사라" }, ex, today) };
  });
  expect(results.filter((r) => !r.needsReview).length).toBe(1); // 정상 1장
  expect(results.filter((r) => r.needsReview && r.checks.find((c) => c.field === "holderName" && !c.ok)).length).toBe(1); // 성명 불일치 1장

  // 강사 본인 권한으로 판독값을 고칠 수 없다
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await anon.auth.signInWithPassword({ email: `test-inst4@${DOMAIN}`, password: process.env.REHEARSAL_PASSWORD! });
  const { error } = await anon.from("instructor_certs").update({ ai_extract: { holder_name: "[테스트] 강사라", readable: true } }).eq("id", rows[0].id);
  expect(error?.message ?? "").toContain("AI 판독값은 고칠 수 없습니다");

  const u = await usageSince(since, "cert");
  report("D1", { results: results.map((r) => ({ holder: r.holder, grade: r.grade, last4: r.last4, expires: r.expires, needsReview: r.needsReview })), calls: u.length, ok: u.every((r) => r.ok), tokens: u.map((r) => [r.input_tokens, r.output_tokens]), cost: Math.round(u.reduce((a, r) => a + Number(r.cost_krw), 0) * 100) / 100 });
});
