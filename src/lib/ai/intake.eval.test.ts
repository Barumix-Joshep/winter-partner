// 실제 API로 접수 추출 정확도를 잰다: AI_EVAL=1 ANTHROPIC_API_KEY=… npx vitest run src/lib/ai/intake.eval.test.ts
// CI·평소 테스트에서는 건너뛴다. 통과 기준: 날짜·시작·종목·인원 4칸이 모두 맞은 샘플 90% 이상.
import { describe, expect, it, vi } from "vitest";
import { callStructured, type AiDeps } from "./client";
import { INTAKE_SCHEMA, INTAKE_TOOL, intakeSystem, normalizeIntake, parseIntake } from "./intake";
import { redact } from "./redact";
import fixtures from "./__fixtures__/intake-samples.json";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const run = process.env.AI_EVAL === "1" && !!process.env.ANTHROPIC_API_KEY;
const SPORTS = ["스키", "스노보드"];

describe.skipIf(!run)("A1 접수 추출 정확도 (실제 API)", () => {
  it("4칸 정답률 90% 이상", async () => {
    const { defaultDeps } = await import("./client");
    const deps: AiDeps = {
      gate: async () => ({ allowed: true, reason: "ok", model: process.env.AI_EVAL_MODEL ?? "claude-haiku-5-5" }),
      record: async () => {},
      transport: defaultDeps.transport,
    };
    let ok = 0;
    for (const s of fixtures.samples) {
      const r = await callStructured(
        { feature: "intake", shopId: null, userId: null, system: intakeSystem(fixtures.today, SPORTS, ["하이원"]), content: redact(s.text).text, toolName: INTAKE_TOOL, schema: INTAKE_SCHEMA, parse: (x) => parseIntake(x, SPORTS) },
        deps,
      );
      const n = r && normalizeIntake(r);
      const e = s.expected;
      if (n && n.date === e.date && n.start === e.start && n.sport === e.sport && n.studentCount === e.studentCount) ok++;
      else console.log("틀림:", s.text, n);
    }
    console.log(`정답 ${ok}/${fixtures.samples.length}`);
    expect(ok / fixtures.samples.length).toBeGreaterThanOrEqual(0.9);
  }, 300_000);
});
