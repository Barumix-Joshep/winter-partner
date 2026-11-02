import type { Browser, Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

export const DOMAIN = "winter-partner.test";

export async function login(page: Page, who: string) {
  const pw = process.env.REHEARSAL_PASSWORD;
  if (!pw) throw new Error("REHEARSAL_PASSWORD가 없습니다 (.env.rehearsal.local)");
  await page.goto("/login");
  await page.getByLabel("이메일").fill(`${who}@${DOMAIN}`);
  await page.getByLabel("비밀번호").fill(pw);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

export async function as(browser: Browser, who: string) {
  const page = await (await browser.newContext()).newPage();
  await login(page, who);
  return page;
}

// 운영 DB 확인용 (서버 키, 테스트 데이터 조회만)
export function prodDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url?.includes("supabase.co")) throw new Error("원격 Supabase 주소가 아닙니다");
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

// 기능별 실호출 기록 (호출 수·토큰·비용)
export async function usageSince(sinceIso: string, feature?: string) {
  let q = prodDb().from("ai_usage").select("feature, model, input_tokens, output_tokens, cost_krw, ok, created_at").gte("created_at", sinceIso);
  if (feature) q = q.eq("feature", feature);
  const { data, error } = await q.order("created_at");
  if (error) throw error;
  return data ?? [];
}

export function report(label: string, v: Record<string, unknown>) {
  console.log(`[P15] ${label} ${JSON.stringify(v)}`);
}
