import { expect, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localSupabase } from "./local-env";

// 시드 계정 (supabase/seed.sql, 비밀번호 winter1234)
export const PASSWORD = "winter1234";
export const SHOP1 = "b0000000-0000-0000-0000-000000000001"; // 하이원 스노우렌탈 (shop1)
export const KIM = "c0000000-0000-0000-0000-000000000021"; // 김스키, 하이원·용평 스키 프리랜서
export const PARK = "c0000000-0000-0000-0000-000000000023"; // 박스키, 하이원 스키 프리랜서

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

// 계정마다 따로 로그인한 탭
export async function as(browser: Browser, email: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, email);
  return page;
}

// 서비스 키 클라이언트: 화면으로 만들 수 없는 전제(가능 일정, 시간 흐름)만 맞추고, 결과를 확인한다
export function admin() {
  const sb = localSupabase();
  return createClient(sb.url, sb.serviceKey, { auth: { persistSession: false } });
}

// 그 계정의 권한(RLS)으로 직접 조회
export async function userClient(email: string) {
  const sb = localSupabase();
  const c = createClient(sb.url, sb.anonKey, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return c;
}

const KST = 9 * 3600_000;
// 오늘부터 n일 뒤의 한국 날짜 (YYYY-MM-DD)
export function kstDate(daysFromNow: number) {
  return new Date(Date.now() + KST + daysFromNow * 86400_000).toISOString().slice(0, 10);
}
// 화면의 날짜 표기 앞부분 (예: "12/20(")
export function dayLabel(date: string) {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}(`;
}
export function kstTime(date: string, hhmm: string) {
  return new Date(`${date}T${hhmm}:00+09:00`).toISOString();
}

export async function addAvailability(instructorId: string, date: string, from = "09:00", to = "17:00") {
  const { error } = await admin()
    .from("availability")
    .insert({ instructor_id: instructorId, starts_at: kstTime(date, from), ends_at: kstTime(date, to) });
  if (error) throw error;
}

// 강습이 끝난 것처럼 시간을 앞당긴다 (완료 보고는 시작 뒤에만 된다).
// 같은 강사의 강습끼리 겹치면 DB가 막으므로 테스트마다 다른 hoursAgo를 쓴다.
export async function moveJobToPast(jobId: string, hoursAgo = 3) {
  const now = Date.now();
  const { error } = await admin()
    .from("jobs")
    .update({ starts_at: new Date(now - hoursAgo * 3600_000).toISOString(), ends_at: new Date(now - (hoursAgo - 2) * 3600_000).toISOString() })
    .eq("id", jobId);
  if (error) throw error;
}

type NewJob = { date: string; start?: string; end?: string; customer: string; phone: string; rate: number; price?: number; note?: string };

// 샵 강습 등록 → 상세 화면으로 이동해 강습 id를 돌려준다
export async function createJob(page: Page, j: NewJob) {
  await page.goto("/shop/jobs/new");
  await page.getByLabel("날짜", { exact: true }).fill(j.date);
  await page.getByLabel("시작", { exact: true }).fill(j.start ?? "10:00");
  await page.getByLabel("끝", { exact: true }).fill(j.end ?? "12:00");
  await page.getByLabel("이름", { exact: true }).fill(j.customer);
  await page.getByLabel("연락처", { exact: true }).fill(j.phone);
  await page.getByLabel("레벨", { exact: true }).fill("초급");
  if (j.note) await page.getByLabel(/요청 사항/).fill(j.note);
  await page.getByLabel(/손님 강습료/).fill(String(j.price ?? j.rate * 2));
  await page.getByLabel(/강사 지급액/).fill(String(j.rate));
  await page.getByRole("button", { name: "임시 저장" }).click();
  await page.waitForURL(/\/shop\/jobs$/);
  // 손님 이름은 테스트마다 다르게 준다
  const { data } = await admin().from("customers").select("id, job_customers(job_id)").eq("name", j.customer).single();
  const jobId = (data as unknown as { job_customers: { job_id: string }[] }).job_customers[0].job_id;
  await page.goto(`/shop/jobs/${jobId}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  return jobId;
}
