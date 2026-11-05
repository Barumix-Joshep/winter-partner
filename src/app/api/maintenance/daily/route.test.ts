// 매일 정리 작업 연결 (P22-6): CRON_SECRET 확인, 손님 익명화·접속 기록·AI 상담 90일 정리(purge_consult_data) 호출,
// 실패하면 500 + 운영 기록(실패), 성공하면 지운 건수만 결과·운영 기록에. DB·운영 기록·인스타 토큰 갱신은 가짜.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  calls: [] as string[],
  fail: null as string | null,
  ops: [] as unknown[][],
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (name: string) => {
      state.calls.push(name);
      if (state.fail === name) return { data: null, error: { message: `${name} failed` } };
      const data =
        name === "purge_consult_data" ? { conversations: 3, messages: 12, feedback: 1, inquiries_deleted: 2, inquiries_kept: 1 } : name === "purge_access_logs" ? 4 : 0;
      return { data, error: null };
    },
  }),
}));
vi.mock("@/lib/ops/record", () => ({ recordOpsEvent: vi.fn(async (...a: unknown[]) => void state.ops.push(a)) }));
vi.mock("@/lib/channels/instagram/deps", () => ({ refreshInstagramTokens: vi.fn(async () => ({ skipped: true, refreshed: 0, failed: 0, expired: 0 })) }));

import { GET } from "./route";

const req = (auth?: string) => new NextRequest("https://app.example/api/maintenance/daily", { headers: auth ? { authorization: auth } : {} });

beforeEach(() => {
  state.calls = [];
  state.fail = null;
  state.ops = [];
  vi.stubEnv("CRON_SECRET", "unit-cron-secret");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /api/maintenance/daily", () => {
  it("CRON_SECRET가 맞지 않으면 401이고 아무것도 지우지 않는다", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req("Bearer "))).status).toBe(401);
    expect(state.calls).toEqual([]);
  });

  it("AI 상담 90일 정리를 기존 정리와 함께 부르고, 지운 건수만 결과·운영 기록에 남긴다", async () => {
    const res = await GET(req("Bearer unit-cron-secret"));
    expect(res.status).toBe(200);
    expect(state.calls.sort()).toEqual(["purge_access_logs", "purge_consult_data", "purge_expired_customers"]);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, purgedConsult: { conversations: 3, messages: 12, feedback: 1, inquiries_deleted: 2, inquiries_kept: 1 } });
    expect(state.ops).toHaveLength(1);
    expect(state.ops[0][0]).toBe("cron_run");
    expect(state.ops[0][3]).toBe(true);
    expect(String(state.ops[0][2])).toContain('"purgedConsult":{"conversations":3');
  });

  it("상담 정리가 실패하면 500 + 운영 기록(실패) — 정리 약속(90일)을 못 지킨 것을 본사가 알 수 있게", async () => {
    state.fail = "purge_consult_data";
    const res = await GET(req("Bearer unit-cron-secret"));
    expect(res.status).toBe(500);
    expect(state.ops).toHaveLength(1);
    expect(state.ops[0][3]).toBe(false);
    expect(String(state.ops[0][2])).toContain("purge_consult_data failed");
  });
});
