import { defineConfig, devices } from "@playwright/test";
import { localSupabase } from "./e2e/local-env";

// 로컬 Supabase+시드로 핵심 시나리오를 돈다: npm run e2e
// 시작할 때 로컬 DB를 시드로 되돌린다 (e2e/global-setup.ts). 원격 DB는 쓰지 않는다.
const sb = localSupabase();
const PORT = 3100;
// 인스타 Send API 가짜 서버 포트 (서버 시작 전에 정해야 해서 고정)
export const IG_FAKE_GRAPH_PORT = 3198;
// E2E_SERVER=start: 운영과 같은 빌드(next build → next start)로 돈다. CI가 이렇게 돌고, 로컬 기본은 개발 서버(next dev).
const prodBuild = process.env.E2E_SERVER === "start";
// E2E_SET=core: 풀 리퀘스트 필수 세트. 오래 걸리는 종합 시나리오(리허설·시즌)는 main 병합 뒤와 매일 밤에 돈다 (docs/ci.md).
export const SLOW_SPECS = ["rehearsal.spec.ts", "season.spec.ts"];
const core = process.env.E2E_SET === "core";

export default defineConfig({
  testDir: "e2e",
  testIgnore: core ? SLOW_SPECS.map((f) => `**/${f}`) : undefined,
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }], ["json", { outputFile: "test-results/report.json" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure",
    ...devices["Pixel 7"],
  },
  webServer: {
    command: prodBuild ? `npx next build && npx next start --port ${PORT}` : `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: prodBuild ? 600_000 : 180_000,
    reuseExistingServer: false,
    // .env.local(원격)보다 이 값이 먼저다
    env: {
      NEXT_PUBLIC_SUPABASE_URL: sb.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: sb.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: sb.serviceKey,
      // AI는 가짜 모델로. 기능 기본값은 global-setup에서 모두 끄고, AI 테스트만 켰다 끈다.
      AI_MOCK: "1",
      ANTHROPIC_API_KEY: "",
      // AI 상담 카카오 웹훅 E2E (P22-3): 시험용 해시 키(비밀 아님)와 가짜 콜백 서버(localhost) 허용. 운영 환경변수에는 넣지 않는다
      CONSULT_HASH_KEY: "e2e-only-consult-hash-key-not-a-secret-0000",
      KAKAO_CALLBACK_ALLOW_LOCAL: "1",
      // AI 상담 인스타 웹훅 E2E (P22-4): 시험용 메타 앱 값·암호화 키(비밀 아님)와 가짜 Graph 서버(e2e/ai-consult-instagram.spec.ts). 운영 값과 무관
      META_APP_ID: "e2e-app",
      META_APP_SECRET: "e2e-only-meta-app-secret-not-a-secret",
      META_VERIFY_TOKEN: "e2e-verify-token",
      CONSULT_ENCRYPTION_KEY: "ZTJlLW9ubHktY29uc3VsdC1lbmMta2V5LTMyYnl0ZXM=",
      META_GRAPH_BASE: `http://127.0.0.1:${IG_FAKE_GRAPH_PORT}`,
    },
  },
});
