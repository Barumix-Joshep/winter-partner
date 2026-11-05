// P22-4 인스타 웹훅: GET 구독 확인(verify token), POST 서명(원문 바이트, 실패 400)·기능 꺼짐 404·200 먼저 + after() 처리,
// mid 중복 제거, 에코·스토리·리액션 자동 답변 없음, 요청 제한, 첫 답변 고지, escalate 안내 한 번, 24시간 지난 재전송은 보내지 않음.
// DB·AI·Graph는 모두 가짜(주입).
import { describe, expect, it, vi } from "vitest";
import type { ConsultResult } from "@/lib/ai/consult/types";
import type { SendResult, SendTarget } from "../types";
import { InstagramAdapter } from "./adapter";
import type { InstagramConfig } from "./config";
import { IG_ACCOUNT, IG_CUSTOMER, igMessaging, igPayload, igSign, igText } from "./fixtures";
import { handleInstagramEvent, instagramRoute, instagramVerify, type InstagramWebhookDeps } from "./webhook";
import { parseWebhook } from "./adapter";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const SECRET = "test-app-secret-0001";
const CFG: InstagramConfig = {
  appId: "app-1",
  appSecret: SECRET,
  verifyToken: "verify-me",
  apiVersion: "v24.0",
  graphBase: "https://graph.example",
  oauthBase: "https://api.example",
  authorizeBase: "https://www.example",
  humanAgent: false,
};
const HASH_KEY = "test-consult-hash-key-0123456789abcdef";
const CHANNEL = { id: "ch-ig", shop_id: "shop-1", channel: "instagram", external_id: IG_ACCOUNT, enabled: true, credentials_enc: "v1.dG9rZW4=" };
const NOW = Date.UTC(2026, 11, 20, 1, 0, 30);

const AUTO: ConsultResult = { mode: "auto", reply: "1:1 2시간 120,000원이에요", confidence: 0.92, intent: "price", promptVersion: "consult-v1" };
const ESC: ConsultResult = { mode: "escalate", reply: "", confidence: 0.7, intent: "booking", draft: "[초안] 확인 후 답드릴게요", extracted: { people: 2 }, reason: "intent", promptVersion: "consult-v1" };

function makeDeps(over: Partial<InstagramWebhookDeps> & { result?: ConsultResult; sendResult?: SendResult } = {}) {
  const deferred: (() => Promise<void>)[] = [];
  const logs: Record<string, unknown>[] = [];
  const sends: { target: SendTarget; text: string; opts: unknown }[] = [];
  const deps: InstagramWebhookDeps = {
    config: () => CFG,
    hashKey: () => HASH_KEY,
    findChannelByAccount: vi.fn(async () => CHANNEL),
    recordCustomerMessage: vi.fn(async () => ({ conversationId: "conv-1", duplicate: false })),
    rateOk: vi.fn(async () => true),
    runConsult: vi.fn(async () => over.result ?? AUTO),
    replyContext: vi.fn(async () => ({ disclosureText: "AI 자동 답변이에요.", discloseFirst: true, disclosedAt: "2026-12-01T00:00:00Z" })),
    recordReply: vi.fn(async () => {}),
    hasOpenInquiry: vi.fn(async () => false),
    openInquiry: vi.fn(async () => {}),
    markDisclosed: vi.fn(async () => {}),
    sender: () => ({
      send: async (target, text, opts) => {
        sends.push({ target, text, opts });
        return over.sendResult ?? { ok: true, status: "sent", tag: "RESPONSE" };
      },
    }),
    defer: (task) => {
      deferred.push(task);
    },
    now: () => NOW,
    log: (e) => logs.push(e),
    ...over,
  };
  const flush = async () => {
    for (const t of deferred.splice(0)) await t();
  };
  return { deps, logs, sends, flush };
}

function post(body: unknown, opts: { secret?: string; signature?: string | null } = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const headers: Record<string, string> = { "content-type": "application/json" };
  const sig = opts.signature === undefined ? igSign(raw, opts.secret ?? SECRET) : opts.signature;
  if (sig) headers["x-hub-signature-256"] = sig;
  return new Request("https://app.example/api/webhooks/instagram", { method: "POST", headers, body: raw });
}

const ev = (message: Record<string, unknown> | null, over: Parameters<typeof igMessaging>[1] = {}) => parseWebhook(igPayload(igMessaging(message, over)))[0];

describe("GET 구독 확인", () => {
  const url = (q: string) => new URL(`https://app.example/api/webhooks/instagram?${q}`);
  it("verify token이 맞으면 challenge를 글자 그대로", async () => {
    const res = instagramVerify(url("hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=1158201444"), CFG);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("1158201444");
  });
  it("token이 틀리거나 mode가 다르면 403", () => {
    expect(instagramVerify(url("hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1"), CFG).status).toBe(403);
    expect(instagramVerify(url("hub.mode=unsubscribe&hub.verify_token=verify-me&hub.challenge=1"), CFG).status).toBe(403);
    expect(instagramVerify(url("hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=%3Cscript%3E"), CFG).status).toBe(403);
  });
  it("환경변수가 없으면 404(기능 꺼짐)", () => {
    expect(instagramVerify(url("hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=1"), null).status).toBe(404);
  });
});

describe("POST 서명·응답", () => {
  const body = igPayload(igMessaging(igText("강습료 얼마예요?")));
  it("서명이 맞으면 200을 먼저 돌려주고 처리는 after()에서", async () => {
    const { deps, flush } = makeDeps();
    const res = await instagramRoute(post(body), deps);
    expect(res.status).toBe(200);
    expect(deps.recordCustomerMessage).not.toHaveBeenCalled(); // 아직 처리 전
    await flush();
    expect(deps.recordCustomerMessage).toHaveBeenCalledTimes(1);
  });
  it("서명이 틀리면 400, 처리하지 않는다", async () => {
    const { deps, flush, logs } = makeDeps();
    expect((await instagramRoute(post(body, { secret: "wrong" }), deps)).status).toBe(400);
    expect((await instagramRoute(post(body, { signature: null }), deps)).status).toBe(400);
    await flush();
    expect(deps.recordCustomerMessage).not.toHaveBeenCalled();
    expect(logs.every((l) => l.outcome === "bad_signature")).toBe(true);
  });
  it("서명은 JSON이 아니라 원문 바이트 기준 (공백만 달라도 거부)", async () => {
    const { deps } = makeDeps();
    const raw = JSON.stringify(body);
    const req = new Request("https://app.example/x", { method: "POST", headers: { "x-hub-signature-256": igSign(raw, SECRET) }, body: JSON.stringify(body, null, 2) });
    expect((await instagramRoute(req, deps)).status).toBe(400);
  });
  it("서명은 맞지만 JSON이 아니면 400", async () => {
    const { deps } = makeDeps();
    expect((await instagramRoute(post("not json"), deps)).status).toBe(400);
  });
  it("환경변수가 없으면 404", async () => {
    const { deps } = makeDeps({ config: () => null });
    expect((await instagramRoute(post(body), deps)).status).toBe(404);
  });
  it("너무 큰 본문은 400", async () => {
    const { deps } = makeDeps();
    expect((await instagramRoute(post({ object: "instagram", pad: "x".repeat(300 * 1024) }), deps)).status).toBe(400);
  });
});

describe("이벤트 처리", () => {
  it("자동 답변: 손님 id는 해시, mid로 저장, RESPONSE로 보내고 태그·발송 결과 기록", async () => {
    const { deps, sends } = makeDeps();
    await handleInstagramEvent(ev(igText("강습료 얼마예요?")), deps);
    const rec = vi.mocked(deps.recordCustomerMessage).mock.calls[0][0];
    expect(rec.userHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.userHash).not.toContain(IG_CUSTOMER);
    expect(rec.messageId).toBe("aWdfZAG1faXRlbTox-mid-0001");
    expect(deps.runConsult).toHaveBeenCalledWith({ shopId: "shop-1", conversationId: "conv-1", text: "강습료 얼마예요?", channel: "instagram" });
    expect(sends[0].target.externalUserId).toBe(IG_CUSTOMER);
    expect(sends[0].opts).toMatchObject({ approvedByOwner: false });
    expect(deps.recordReply).toHaveBeenCalledWith(expect.objectContaining({ role: "ai", text: AUTO.reply, delivery: "sent", tag: "RESPONSE" }));
    expect(deps.openInquiry).not.toHaveBeenCalled();
  });
  it("첫 자동 답변에는 고지 문구, 보낸 뒤 고지 표시", async () => {
    const { deps, sends } = makeDeps({ replyContext: async () => ({ disclosureText: "AI 자동 답변이에요.", discloseFirst: true, disclosedAt: null }) });
    await handleInstagramEvent(ev(igText("영업시간?")), deps);
    expect(sends[0].text).toBe(`AI 자동 답변이에요.\n\n${AUTO.reply}`);
    expect(deps.markDisclosed).toHaveBeenCalledWith("conv-1");
  });
  it("고지 + 긴 답도 1000바이트 안으로", async () => {
    const { deps, sends } = makeDeps({
      result: { ...AUTO, reply: "가".repeat(330) },
      replyContext: async () => ({ disclosureText: "AI 자동 답변이에요.", discloseFirst: true, disclosedAt: null }),
    });
    await handleInstagramEvent(ev(igText("가격?")), deps);
    expect(new TextEncoder().encode(sends[0].text).length).toBeLessThanOrEqual(1000);
  });
  it("같은 mid 재전송(중복)은 엔진·발송 없이 끝", async () => {
    const { deps, sends, logs } = makeDeps({ recordCustomerMessage: vi.fn(async () => ({ conversationId: "conv-1", duplicate: true })) });
    await handleInstagramEvent(ev(igText("강습료 얼마예요?")), deps);
    expect(deps.runConsult).not.toHaveBeenCalled();
    expect(sends).toHaveLength(0);
    expect(logs.at(-1)?.outcome).toBe("duplicate");
  });
  it("escalate: 사장님께 전달 안내 + 문의 열기 (열린 문의가 있으면 안내는 다시 보내지 않는다)", async () => {
    const first = makeDeps({ result: ESC });
    await handleInstagramEvent(ev(igText("20일 2명 예약돼요?")), first.deps);
    expect(first.sends).toHaveLength(1);
    expect(first.deps.recordReply).toHaveBeenCalledWith(expect.objectContaining({ role: "system", delivery: "sent" }));
    expect(first.deps.openInquiry).toHaveBeenCalledWith({ conversationId: "conv-1", type: "booking", extracted: { people: 2 }, draft: ESC.draft });

    const again = makeDeps({ result: ESC, hasOpenInquiry: async () => true });
    await handleInstagramEvent(ev(igText("3명으로 바꿀게요")), again.deps);
    expect(again.sends).toHaveLength(0);
    expect(again.deps.recordReply).not.toHaveBeenCalled();
    expect(again.deps.openInquiry).toHaveBeenCalledTimes(1);
  });
  it("에코·리액션·읽음은 저장도 답장도 없다", async () => {
    const { deps, sends } = makeDeps();
    await handleInstagramEvent(ev({ ...igText("우리 답장"), is_echo: true }, { sender: IG_ACCOUNT, recipient: IG_CUSTOMER }), deps);
    await handleInstagramEvent(ev(null, { extra: { reaction: { mid: "m1", action: "react", reaction: "love" } } }), deps);
    await handleInstagramEvent(ev(null, { extra: { read: { mid: "m1" } } }), deps);
    expect(deps.recordCustomerMessage).not.toHaveBeenCalled();
    expect(sends).toHaveLength(0);
  });
  it("스토리 답장·멘션·첨부는 저장만(엔진·답장 없음)", async () => {
    const { deps, sends } = makeDeps();
    await handleInstagramEvent(ev({ mid: "m1", text: "멋져요", reply_to: { story: { id: "s1", url: "https://cdn.example/s" } } }), deps);
    await handleInstagramEvent(ev({ mid: "m2", attachments: [{ type: "story_mention", payload: { url: "https://cdn.example/x" } }] }), deps);
    await handleInstagramEvent(ev({ mid: "m3", attachments: [{ type: "image", payload: { url: "https://cdn.example/i" } }] }), deps);
    expect(vi.mocked(deps.recordCustomerMessage).mock.calls.map((c) => c[0].text)).toEqual(["[스토리 답장] 멋져요", "[스토리 멘션]", "[첨부: image]"]);
    expect(deps.runConsult).not.toHaveBeenCalled();
    expect(sends).toHaveLength(0);
  });
  it("연결 안 된 계정·꺼진 채널·해시 키 없음은 저장하지 않는다", async () => {
    for (const over of [{ findChannelByAccount: async () => null }, { findChannelByAccount: async () => ({ ...CHANNEL, enabled: false }) }, { hashKey: () => null }]) {
      const { deps } = makeDeps(over);
      await handleInstagramEvent(ev(igText("x")), deps);
      expect(deps.recordCustomerMessage).not.toHaveBeenCalled();
    }
  });
  it("샵 요청 제한을 넘으면 저장하지 않고, 대화 제한을 넘으면 저장만", async () => {
    const shop = makeDeps({ rateOk: vi.fn(async (name) => name !== "consult_shop") });
    await handleInstagramEvent(ev(igText("x")), shop.deps);
    expect(shop.deps.recordCustomerMessage).not.toHaveBeenCalled();

    const conv = makeDeps({ rateOk: vi.fn(async (name) => name !== "consult_conversation") });
    await handleInstagramEvent(ev(igText("x")), conv.deps);
    expect(conv.deps.recordCustomerMessage).toHaveBeenCalled();
    expect(conv.deps.runConsult).not.toHaveBeenCalled();
    expect(conv.sends).toHaveLength(0);
  });
  it("엔진이 실패하면 escalate(사장님께)", async () => {
    const { deps } = makeDeps({ runConsult: vi.fn(async () => Promise.reject(new Error("x"))) });
    await handleInstagramEvent(ev(igText("x")), deps);
    expect(deps.openInquiry).toHaveBeenCalled();
  });
  it("토큰을 못 풀면 failed로 기록", async () => {
    const { deps } = makeDeps({ sender: () => null });
    await handleInstagramEvent(ev(igText("x")), deps);
    expect(deps.recordReply).toHaveBeenCalledWith(expect.objectContaining({ delivery: "failed" }));
  });
  it("늦게 온 첫 전달(24시간 지남)은 실제 어댑터가 보내지 않고 skipped로 기록", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}"));
    const late = NOW + 25 * 60 * 60 * 1000;
    const { deps } = makeDeps({
      now: () => late,
      sender: () => new InstagramAdapter({ config: CFG, accountId: IG_ACCOUNT, accessToken: "t", fetchImpl, now: () => new Date(late) }),
    });
    await handleInstagramEvent(ev(igText("x")), deps);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(deps.recordReply).toHaveBeenCalledWith(expect.objectContaining({ delivery: "skipped", tag: null }));
  });
  it("로그에 손님 글·손님 id가 없다", async () => {
    const { deps, logs } = makeDeps();
    await handleInstagramEvent(ev(igText("제 번호는 010-0000-1234 입니다")), deps);
    const all = JSON.stringify(logs);
    expect(all).not.toContain("010-0000-1234");
    expect(all).not.toContain(IG_CUSTOMER);
  });
});
