// P19-4 경로 예열: 개발 서버(next dev)는 경로를 처음 열 때 컴파일한다. 전체 E2E 뒤쪽 테스트(리허설 4단계의 PDF·Excel 등)가
// 그 컴파일 시간 때문에 제한 시간을 넘던 문제를, 테스트 시작 전에 모든 화면·경로를 한 번씩 열어 두는 것으로 없앤다.
// Playwright는 webServer를 global-setup보다 먼저 띄우므로 여기서 서버를 쓸 수 있다.
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";

const ZERO = "00000000-0000-0000-0000-000000000000";

// src/app 아래 page.tsx·route.ts에서 경로를 뽑는다. 동적 조각은 없는 id로 채운다(404여도 컴파일은 된다).
export function appRoutes(dir = path.join(process.cwd(), "src/app"), base = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name.startsWith("_") || name.startsWith("@")) continue;
      const seg = name.startsWith("(") ? "" : name.startsWith("[") ? `/${ZERO}` : `/${name}`;
      out.push(...appRoutes(full, base + seg));
    } else if (name === "page.tsx" || name === "route.ts") {
      out.push(base || "/");
    }
  }
  return [...new Set(out)].sort();
}

// 역할마다 볼 수 있는 경로가 다르다 (다른 역할 경로는 리다이렉트만 되고 컴파일이 안 될 수 있다)
const AREAS: [string, (r: string) => boolean][] = [
  ["admin@winter.test", (r) => r.startsWith("/admin")],
  ["shop1@winter.test", (r) => r.startsWith("/shop") || r.startsWith("/settlements") || ["/", "/help", "/notifications", "/onboarding"].includes(r)],
  ["kim@winter.test", (r) => r.startsWith("/instructor")],
];
const SKIP = new Set(["/api/maintenance/daily", "/api/notify/dispatch", "/shop/new"]); // 크론·발송(비밀 키 필요), 샵이 있으면 되돌아감

async function visit(page: Page, url: string) {
  try {
    await page.goto(url, { waitUntil: "load", timeout: 120_000 });
  } catch {
    // 파일 내려받기(Excel·PDF)는 goto가 "Download is starting"으로 끝난다. 컴파일은 이미 됐다.
  }
}

export async function warmUp(baseURL: string, password: string) {
  const started = Date.now();
  const routes = appRoutes().filter((r) => !SKIP.has(r));
  const browser = await chromium.launch();
  try {
    // 로그인 없이 여는 화면
    const anon = await browser.newPage({ baseURL });
    for (const r of routes.filter((r) => !AREAS.some(([, f]) => f(r)))) await visit(anon, r);
    for (const [email, inArea] of AREAS) {
      const ctx = await browser.newContext({ baseURL, acceptDownloads: true });
      const page = await ctx.newPage();
      await page.goto("/login");
      await page.getByLabel("이메일").fill(email);
      await page.getByLabel("비밀번호").fill(password);
      await page.getByRole("button", { name: "로그인" }).click();
      await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120_000 });
      for (const r of routes.filter(inArea)) await visit(page, r);
      // 내려받기 경로는 실제 값으로 한 번 더 (PDF 생성 라이브러리·글꼴까지 불러 둔다)
      if (email.startsWith("shop1")) {
        await page.request.get("/shop/settlements/export?month=2026-01", { timeout: 120_000 }).catch(() => {});
        await page.request.get("/shop/import/template?type=customers", { timeout: 120_000 }).catch(() => {});
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`경로 예열 ${routes.length}개 (${Math.round((Date.now() - started) / 1000)}초)`);
}
