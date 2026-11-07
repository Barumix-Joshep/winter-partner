import { defineConfig, devices } from "@playwright/test";

// 운영(PROD_URL, 없으면 https://winter-partner.vercel.app) 실호출 스모크. 테스트 전용 계정(@winter-partner.test)만 쓴다.
// 실행: npm run e2e:prod  (.env.local의 원격 Supabase 키와 .env.rehearsal.local의 비밀번호를 읽는다. 값은 출력하지 않는다)
export default defineConfig({
  testDir: "e2e-prod",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 40_000 },
  reporter: [["list"]],
  use: { baseURL: process.env.PROD_URL || "https://winter-partner.vercel.app", locale: "ko-KR", timezoneId: "Asia/Seoul", trace: "retain-on-failure", ...devices["Desktop Chrome"] },
});
