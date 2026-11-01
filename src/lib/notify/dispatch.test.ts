import { beforeEach, describe, expect, it, vi } from "vitest";

const sent: { endpoint: string; body: unknown }[] = [];
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async (sub: { endpoint: string }, body: string) => {
      if (sub.endpoint.includes("gone")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      sent.push({ endpoint: sub.endpoint, body: JSON.parse(body) });
    }),
  },
}));
vi.mock("next/server", () => ({ after: vi.fn() }));

const deleted: string[][] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async () => ({
      data: [
        { id: "n1", user_id: "u1", kind: "job_offer", payload: { job_id: "j1" } },
        { id: "n2", user_id: "u2", kind: "settlement_paid", payload: { net: 193400 } },
      ],
    }),
    from: (table: string) => ({
      select: () => ({
        in: async () =>
          table === "jobs"
            ? { data: [{ id: "j1", starts_at: "2026-12-20T01:00:00Z", ends_at: "2026-12-20T03:00:00Z", shops: { name: "하이원" } }] }
            : {
                data: [
                  { id: "s1", user_id: "u1", endpoint: "https://push/a", p256dh: "k", auth: "a" },
                  { id: "s2", user_id: "u1", endpoint: "https://push/gone", p256dh: "k", auth: "a" },
                  { id: "s3", user_id: "u2", endpoint: "https://push/b", p256dh: "k", auth: "a" },
                ],
              },
      }),
      delete: () => ({ in: async (_: string, ids: string[]) => void deleted.push(ids) }),
    }),
  }),
}));

describe("dispatchPending", () => {
  beforeEach(() => {
    sent.length = 0;
    deleted.length = 0;
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pub";
    process.env.VAPID_PRIVATE_KEY = "priv";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
  });

  it("사람마다 그 사람의 구독으로 보내고, 만료된 구독은 지운다", async () => {
    const { dispatchPending } = await import("./dispatch");
    expect(await dispatchPending()).toEqual({ sent: 2 });
    expect(sent).toEqual([
      { endpoint: "https://push/a", body: { title: "새 직접 의뢰", body: "하이원 · 12/20(일) 10:00~12:00", url: "/instructor" } },
      { endpoint: "https://push/b", body: { title: "정산금이 지급됐습니다", body: "실지급 193,400원", url: "/instructor/pay" } },
    ]);
    expect(deleted).toEqual([["s2"]]);
  });

  it("웹푸시 키가 없으면 알림을 가져가지 않는다 (나중에 보낼 수 있게)", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    const { dispatchPending } = await import("./dispatch");
    expect(await dispatchPending()).toEqual({ sent: 0, skipped: "웹푸시 키가 없습니다" });
  });
});
