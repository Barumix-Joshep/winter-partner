// P22-5 사장님 승인 발송(인스타): 실제 어댑터(InstagramAdapter) + 가짜 fetch로 24시간 / 24시간~7일(Human Agent 켜짐·꺼짐) / 7일 초과,
// 발송 결과 기록(보낸 것·실패만, 창 밖 거부는 기록하지 않음), 연결 끊김·손님 계정 없음.
import { describe, expect, it, vi } from "vitest";
import { InstagramAdapter } from "./instagram/adapter";
import { ownerSendInstagram, type OwnerSendDeps, type OwnerSendTarget } from "./owner-reply";

const NOW = new Date("2026-12-20T10:00:00Z");
const HOUR = 3_600_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

function setup(opts: { last?: string | null; humanAgent?: boolean; status?: number; replyTo?: string | null; enabled?: boolean } = {}) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return new Response("{}", { status: opts.status ?? 200 });
  });
  const recorded: unknown[] = [];
  const target: OwnerSendTarget = {
    conversationId: "conv-1",
    channel: "instagram",
    enabled: opts.enabled ?? true,
    accountId: "17841400000000077",
    credentialsEnc: "v1.token",
    replyToEnc: opts.replyTo === undefined ? "v1.user" : opts.replyTo,
    lastCustomerMessageAt: opts.last === undefined ? ago(2 * HOUR) : opts.last,
  };
  const deps: OwnerSendDeps = {
    loadTarget: async (id) => (id === "conv-1" ? target : null),
    decrypt: (enc) => (enc === "v1.token" ? "tok" : enc === "v1.user" ? "ig-user-9" : "x"),
    makeSender: (accountId, token) =>
      new InstagramAdapter({ config: { graphBase: "http://graph.test", apiVersion: "v24.0", humanAgent: opts.humanAgent ?? false }, accountId, accessToken: token, fetchImpl, now: () => NOW }),
    record: async (r) => {
      recorded.push(r);
    },
  };
  return { deps, calls, recorded };
}

describe("ownerSendInstagram", () => {
  it("24시간 안: RESPONSE로 보내고 사장님 답장(sent)을 남긴다", async () => {
    const { deps, calls, recorded } = setup();
    const r = await ownerSendInstagram(deps, "conv-1", "12월 20일 2명 가능해요");
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ recipient: { id: "ig-user-9" }, messaging_type: "RESPONSE", message: { text: "12월 20일 2명 가능해요" } });
    expect(recorded).toEqual([{ conversationId: "conv-1", text: "12월 20일 2명 가능해요", delivery: "sent", tag: "RESPONSE" }]);
  });

  it("24시간~7일 + Human Agent 꺼짐(심사 전): 보내지 않고 기록도 없이 안내", async () => {
    const { deps, calls, recorded } = setup({ last: ago(48 * HOUR) });
    const r = await ownerSendInstagram(deps, "conv-1", "답장");
    expect(r).toMatchObject({ ok: false });
    expect(r.message).toMatch(/Human Agent/);
    expect(calls).toHaveLength(0);
    expect(recorded).toHaveLength(0);
  });

  it("24시간~7일 + Human Agent 켜짐: 사장님 승인이라 HUMAN_AGENT 태그로 보낸다", async () => {
    const { deps, calls, recorded } = setup({ last: ago(48 * HOUR), humanAgent: true });
    const r = await ownerSendInstagram(deps, "conv-1", "답장");
    expect(r.ok).toBe(true);
    expect(calls[0].body).toMatchObject({ messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" });
    expect(recorded).toEqual([expect.objectContaining({ delivery: "sent", tag: "HUMAN_AGENT" })]);
  });

  it("7일 초과: Human Agent가 켜져 있어도 거부", async () => {
    const { deps, calls } = setup({ last: ago(7 * 24 * HOUR + 60_000), humanAgent: true });
    const r = await ownerSendInstagram(deps, "conv-1", "답장");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/7일/);
    expect(calls).toHaveLength(0);
  });

  it("Send API 실패: failed로 남기고 다시 보내지 않는다", async () => {
    const { deps, calls, recorded } = setup({ status: 500 });
    const r = await ownerSendInstagram(deps, "conv-1", "답장");
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(1);
    expect(recorded).toEqual([expect.objectContaining({ delivery: "failed" })]);
  });

  it("연결이 끊겼거나 손님 계정 정보가 없으면 보내지 않는다", async () => {
    const off = setup({ enabled: false });
    expect((await ownerSendInstagram(off.deps, "conv-1", "답장")).message).toMatch(/연결/);
    const noUser = setup({ replyTo: null });
    expect((await ownerSendInstagram(noUser.deps, "conv-1", "답장")).message).toMatch(/인스타그램 앱/);
    expect(noUser.calls).toHaveLength(0);
  });

  it("없는 대화·인스타가 아닌 대화는 거부", async () => {
    const { deps } = setup();
    expect((await ownerSendInstagram(deps, "other", "답장")).ok).toBe(false);
  });
});
