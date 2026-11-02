import { defineConfig, devices } from "@playwright/test";
import { localSupabase } from "./e2e/local-env";

// 로컬 Supabase+시드로 핵심 시나리오를 돈다: npm run e2e
// 시작할 때 로컬 DB를 시드로 되돌린다 (e2e/global-setup.ts). 원격 DB는 쓰지 않는다.
const sb = localSupabase();
const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure",
    ...devices["Pixel 7"],
  },
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 180_000,
    reuseExistingServer: false,
    // .env.local(원격)보다 이 값이 먼저다
    env: {
      NEXT_PUBLIC_SUPABASE_URL: sb.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: sb.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: sb.serviceKey,
      // AI는 가짜 모델로. 기능 기본값은 global-setup에서 모두 끄고, AI 테스트만 켰다 끈다.
      AI_MOCK: "1",
      ANTHROPIC_API_KEY: "",
    },
  },
});
