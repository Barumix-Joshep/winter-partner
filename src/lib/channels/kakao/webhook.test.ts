// P22-3 카카오 웹훅 흐름: 3.5초 경계(즉답/콜백), 콜백 1회·실패 기록, 중복 발화, 요청 제한, 꺼진 채널·봇 id 불일치, 해시 키 없음.
// DB·AI·카카오는 모두 가짜(주입). 시간은 가짜 타이머.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsultResult } from "@/lib/ai/consult/types";
import { skillPayload } from "./fixtures";
import { busyResponse, callbackAck, duplicateResponse, escalateResponse, guidanceResponse, simpleTextResponse, ESCALATE_TEXT } from "./format";
import { handleKakaoSkill, kakaoRoute, type KakaoWebhookDeps } from "./webhook";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const TOKEN = "a".repeat(48);
const HASH_KEY = "test-consult-hash-key-0123456789abcdef";
const CHANNEL = { id: "ch-1", shop_id: "shop-1", channel: "kakao", external_id: "bot-0001", enabled: true };

const AUTO: ConsultResult = { mode: "auto", reply: "안내드려요. 1:1 2시간 120,000원", confidence: 0.92, intent: "price", promptVersion: "consult-v1" };
const ESC: ConsultResult = {
  mode: "escalate",
  reply: "문의 감사합니다! 사장님께 전달했어요. 확인 후 곧 답드릴게요.",
  confidence: 0.8,
  intent: "booking",
  draft: "[초안] 확인 후 연락드리겠습니다.",
  extracted: { people: 2, date: "12월 20일" },
  reason: "intent",
  promptVersion: "consult-v1",
};

function makeDeps(over: Partial<KakaoWebhookDeps> & { engineMs?: number; result?: ConsultResult } = {}) {
  const deferred: Promise<void>[] = [];
  const logs: Record<string, unknown>[] = [];
  const deps: KakaoWebhookDeps = {
    hashKey: () => HASH_KEY,
    findChannel: vi.fn(async () => CHANNEL),
    recordCustomerMessage: vi.fn(async () => ({ conversationId: "conv-1", duplicate: false })),
    rateOk: vi.fn(async () => true),
    runConsult: vi.fn(
      () => new Promise<ConsultResult>((resolve) => setTimeout(() => resolve(over.result ?? AUTO), over.engineMs ?? 100)),
    ),
    replyContext: vi.fn(async () => ({ disclosureText: "AI 자동 답변이에요.", discloseFirst: true, disclosedAt: "2026-11-01T00:00:00Z" })),
    recordReply: vi.fn(async () => {}),
    openInquiry: vi.fn(async () => {}),
    markDisclosed: vi.fn(async () => {}),
    postCallback: vi.fn(async () => true),
    defer: (task) => {
      deferred.push(task());
    },
    now: () => Date.now(),
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    budgetMs: 3_500,
    log: (e) => logs.push(e),
    ...over,
  };
  // 응답을 받은 뒤 after() 작업까지 끝낸다
  const flush = async () => {
    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.all(deferred);
  };
  return { deps, deferred, logs, flush };
}

async function run(deps: KakaoWebhookDeps, payload: unknown = skillPayload(), advanceMs = 10_000, token = TOKEN) {
  const p = handleKakaoSkill(token, payload, deps);
  await vi.advanceTimersByTimeAsync(advanceMs);
  return p;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-12-20T01:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("즉답 (3.5초 안)", () => {
  it("자동 답변은 simpleText로 바로, 답변 기록은 sent", async () => {
    const { deps, flush } = makeDeps();
    expect(await run(deps)).toEqual(simpleTextResponse(AUTO.reply));
    await flush();
    expect(deps.postCallback).not.toHaveBeenCalled();
    expect(deps.recordReply).toHaveBeenCalledWith({
      conversationId: "conv-1",
      role: "ai",
      text: AUTO.reply,
      intent: "price",
      confidence: 0.92,
      promptVersion: "consult-v1",
      delivery: "sent",
    });
    expect(deps.runConsult).toHaveBeenCalledWith({ shopId: "shop-1", conversationId: "conv-1", text: "강습료 얼마예요?", channel: "kakao" });
  });

  it("3.4초에 끝나면 즉답", async () => {
    const { deps, flush } = makeDeps({ engineMs: 3_400 });
    expect(await run(deps, skillPayload(), 3_450)).toEqual(simpleTextResponse(AUTO.reply));
    await flush();
    expect(deps.postCallback).not.toHaveBeenCalled();
  });

  it("escalate면 상담 연결 버튼 + 문의 열기(초안·추출 정보, 유형 매핑) + system 답변 기록", async () => {
    const { deps, flush } = makeDeps({ result: ESC });
    expect(await run(deps)).toEqual(escalateResponse());
    await flush();
    expect(deps.openInquiry).toHaveBeenCalledWith({ conversationId: "conv-1", type: "booking", extracted: ESC.extracted, draft: ESC.draft, contact: null });
    expect(deps.recordReply).toHaveBeenCalledWith(expect.objectContaining({ role: "system", text: ESCALATE_TEXT, intent: "booking", delivery: "sent" }));
  });

  it.each([
    ["complaint", "complaint"],
    ["negotiation", "other"],
    ["unknown", "other"],
    ["smalltalk", "other"],
  ] as const)("의도 %s → 문의 유형 %s", async (intent, type) => {
    const { deps, flush } = makeDeps({ result: { ...ESC, intent } });
    await run(deps);
    await flush();
    expect(deps.openInquiry).toHaveBeenCalledWith(expect.objectContaining({ type }));
  });

  it("엔진이 예외를 던지면 escalate", async () => {
    const { deps, flush } = makeDeps({ runConsult: vi.fn(async () => Promise.reject(new Error("boom"))) });
    expect(await run(deps)).toEqual(escalateResponse());
    await flush();
    expect(deps.openInquiry).toHaveBeenCalledTimes(1);
  });
});

describe("AI 고지 (첫 자동 답변)", () => {
  it("disclosed_at이 비어 있으면 고지 문구를 앞에 붙이고 표시한다", async () => {
    const { deps, flush } = makeDeps({ replyContext: vi.fn(async () => ({ disclosureText: "AI 자동 답변이에요.", discloseFirst: true, disclosedAt: null })) });
    expect(await run(deps)).toEqual(simpleTextResponse(`AI 자동 답변이에요.\n\n${AUTO.reply}`));
    await flush();
    expect(deps.markDisclosed).toHaveBeenCalledWith("conv-1");
    expect(deps.recordReply).toHaveBeenCalledWith(expect.objectContaining({ text: `AI 자동 답변이에요.\n\n${AUTO.reply}` }));
  });
  it("이미 고지했으면 붙이지 않는다", async () => {
    const { deps, flush } = makeDeps();
    expect(await run(deps)).toEqual(simpleTextResponse(AUTO.reply));
    await flush();
    expect(deps.markDisclosed).not.toHaveBeenCalled();
  });
  it("샵이 고지를 끄면 붙이지 않는다", async () => {
    const { deps, flush } = makeDeps({ replyContext: vi.fn(async () => ({ disclosureText: "AI", discloseFirst: false, disclosedAt: null })) });
    expect(await run(deps)).toEqual(simpleTextResponse(AUTO.reply));
    await flush();
    expect(deps.markDisclosed).not.toHaveBeenCalled();
  });
  it("escalate 안내에는 고지를 붙이지 않는다", async () => {
    const { deps, flush } = makeDeps({ result: ESC, replyContext: vi.fn(async () => ({ disclosureText: "AI", discloseFirst: true, disclosedAt: null })) });
    expect(await run(deps)).toEqual(escalateResponse());
    await flush();
    expect(deps.markDisclosed).not.toHaveBeenCalled();
  });
});

describe("콜백 (3.5초 넘김)", () => {
  it.each([3_600, 4_000])("%dms에 끝나면 useCallback으로 답하고, 끝난 뒤 콜백을 한 번 보낸다", async (ms) => {
    const { deps, flush } = makeDeps({ engineMs: ms });
    expect(await run(deps, skillPayload(), 3_500)).toEqual(callbackAck());
    expect(deps.postCallback).not.toHaveBeenCalled(); // 아직 엔진이 안 끝났다
    await flush();
    expect(deps.postCallback).toHaveBeenCalledTimes(1);
    expect(deps.postCallback).toHaveBeenCalledWith("https://bot-api.kakao.com/v1/callback/abc", simpleTextResponse(AUTO.reply));
    expect(deps.recordReply).toHaveBeenCalledWith(expect.objectContaining({ role: "ai", delivery: "sent" }));
  });

  it("escalate 결과도 콜백으로 (상담 연결 버튼)", async () => {
    const { deps, flush } = makeDeps({ engineMs: 4_000, result: ESC });
    expect(await run(deps, skillPayload(), 3_500)).toEqual(callbackAck());
    await flush();
    expect(deps.postCallback).toHaveBeenCalledWith(expect.any(String), escalateResponse());
    expect(deps.openInquiry).toHaveBeenCalledTimes(1);
  });

  it("콜백이 실패하면 다시 보내지 않고 failed로 남긴다, 고지 표시도 하지 않는다", async () => {
    const { deps, flush } = makeDeps({
      engineMs: 4_000,
      postCallback: vi.fn(async () => false),
      replyContext: vi.fn(async () => ({ disclosureText: "AI", discloseFirst: true, disclosedAt: null })),
    });
    await run(deps, skillPayload(), 3_500);
    await flush();
    expect(deps.postCallback).toHaveBeenCalledTimes(1);
    expect(deps.recordReply).toHaveBeenCalledWith(expect.objectContaining({ delivery: "failed" }));
    expect(deps.markDisclosed).not.toHaveBeenCalled();
  });

  it("콜백 주소가 없으면(블록 콜백 꺼짐) 사람에게 넘기는 안내로 바로 답하고, 늦은 답은 skipped + 문의로", async () => {
    const { deps, flush } = makeDeps({ engineMs: 4_000 });
    expect(await run(deps, skillPayload({ callbackUrl: null }), 3_500)).toEqual(escalateResponse());
    await flush();
    expect(deps.postCallback).not.toHaveBeenCalled();
    expect(deps.recordReply).toHaveBeenCalledWith(expect.objectContaining({ role: "ai", text: AUTO.reply, delivery: "skipped" }));
    expect(deps.openInquiry).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "conv-1", draft: AUTO.reply }));
  });

  it("카카오가 아닌 콜백 주소로는 보내지 않는다", async () => {
    const { deps, flush } = makeDeps({ engineMs: 4_000 });
    expect(await run(deps, skillPayload({ callbackUrl: "https://evil.test/cb" }), 3_500)).toEqual(escalateResponse());
    await flush();
    expect(deps.postCallback).not.toHaveBeenCalled();
  });

  it("남은 시간은 요청을 받은 때부터 센다 (DB 조회가 오래 걸리면 그만큼 줄어든다)", async () => {
    const { deps, flush } = makeDeps({
      engineMs: 3_000,
      findChannel: vi.fn(() => new Promise<typeof CHANNEL>((r) => setTimeout(() => r(CHANNEL), 1_000))),
    });
    expect(await run(deps, skillPayload(), 3_600)).toEqual(callbackAck());
    await flush();
    expect(deps.postCallback).toHaveBeenCalledTimes(1);
  });
});

describe("중복·요청 제한", () => {
  it("같은 발화가 다시 오면 엔진을 다시 돌리지 않는다", async () => {
    const { deps } = makeDeps({ recordCustomerMessage: vi.fn(async () => ({ conversationId: "conv-1", duplicate: true })) });
    expect(await run(deps)).toEqual(duplicateResponse());
    expect(deps.runConsult).not.toHaveBeenCalled();
    expect(deps.recordReply).not.toHaveBeenCalled();
  });

  it("발화 id가 없으면 손님·30초 구간·발화로 만든다 (같은 구간 같은 글은 같은 id)", async () => {
    const { deps } = makeDeps();
    await run(deps);
    await run(deps);
    await run(deps, skillPayload({ utterance: "영업시간이요" }));
    vi.setSystemTime(new Date("2026-12-20T01:01:00Z"));
    await run(deps);
    const ids = (deps.recordCustomerMessage as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[0] as { messageId: string }).messageId);
    expect(ids[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).not.toBe(ids[0]);
    expect(ids[3]).not.toBe(ids[0]);
  });

  it("카카오가 준 발화 id가 있으면 그것을 쓴다", async () => {
    const { deps } = makeDeps();
    const p = skillPayload();
    await run(deps, { ...p, userRequest: { ...p.userRequest, id: "utt-77" } });
    expect(deps.recordCustomerMessage).toHaveBeenCalledWith(expect.objectContaining({ messageId: "kakao:ch-1:utt-77" }));
  });

  it("손님 id는 해시로만 넘긴다", async () => {
    const { deps } = makeDeps();
    await run(deps);
    const arg = (deps.recordCustomerMessage as ReturnType<typeof vi.fn>).mock.calls[0][0] as { userHash: string; channelId: string };
    expect(arg.userHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(arg)).not.toContain("kakao-user-0001");
    expect(arg.channelId).toBe("ch-1");
  });

  it("샵 요청 제한을 넘으면 저장·AI 없이 상담 연결 안내", async () => {
    const { deps } = makeDeps({ rateOk: vi.fn(async (name: string) => name !== "consult_shop") });
    expect(await run(deps)).toEqual(busyResponse());
    expect(deps.recordCustomerMessage).not.toHaveBeenCalled();
    expect(deps.runConsult).not.toHaveBeenCalled();
  });

  it("대화 요청 제한을 넘으면 AI를 부르지 않는다", async () => {
    const { deps } = makeDeps({ rateOk: vi.fn(async (name: string) => name !== "consult_conversation") });
    expect(await run(deps)).toEqual(busyResponse());
    expect(deps.recordCustomerMessage).toHaveBeenCalledTimes(1);
    expect(deps.runConsult).not.toHaveBeenCalled();
    expect(deps.rateOk).toHaveBeenCalledWith("consult_conversation", "conv-1");
    expect(deps.rateOk).toHaveBeenCalledWith("consult_shop", "shop-1");
  });

  it("대화 요청 제한을 넘으면 상담 연결 안내 + 사장님께 문의로 넘긴다 (P22-6)", async () => {
    const { deps, flush, logs } = makeDeps({ rateOk: vi.fn(async (name: string) => name !== "consult_conversation") });
    const res = await run(deps, skillPayload({ utterance: "010-0000-7777 로 전화 주세요" }));
    expect(res).toEqual(busyResponse());
    expect(JSON.stringify(res)).toContain("operator"); // 상담 연결 버튼
    await flush();
    expect(deps.runConsult).not.toHaveBeenCalled();
    expect(deps.openInquiry).toHaveBeenCalledWith({ conversationId: "conv-1", type: "other", extracted: undefined, draft: undefined, contact: "010-0000-7777" });
    expect(logs.map((l) => l.outcome)).toContain("rate_conversation");
  });

  it("손님 글 속 전화·이메일: 메시지에는 가린 글, 문의에는 연락처(저장 쪽이 암호화), 자동 답변이어도 문의를 연다 (P22-6)", async () => {
    const { deps, flush, logs } = makeDeps();
    expect(await run(deps, skillPayload({ utterance: "강습료 얼마예요? 010-0000-1234 kim@example.com" }))).toEqual(simpleTextResponse(AUTO.reply));
    await flush();
    const saved = (deps.recordCustomerMessage as ReturnType<typeof vi.fn>).mock.calls[0][0] as { text: string };
    expect(saved.text).toBe("강습료 얼마예요? 010-****-1234 k***@example.com");
    expect(deps.openInquiry).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "conv-1", contact: "010-0000-1234, kim@example.com" }));
    expect(JSON.stringify(logs)).not.toMatch(/0000-1234|kim@example/);
  });

  it("연락처가 없는 자동 답변은 문의를 열지 않는다", async () => {
    const { deps, flush } = makeDeps();
    await run(deps);
    await flush();
    expect(deps.openInquiry).not.toHaveBeenCalled();
  });
});

describe("기본 안내 (자동 상담 안 함)", () => {
  const cases: [string, Partial<KakaoWebhookDeps>, unknown?, string?][] = [
    ["없는 토큰", { findChannel: vi.fn(async () => null) }],
    ["꺼진 채널", { findChannel: vi.fn(async () => ({ ...CHANNEL, enabled: false })) }],
    ["카카오가 아닌 채널", { findChannel: vi.fn(async () => ({ ...CHANNEL, channel: "instagram" })) }],
    ["봇 id가 다름", {}, skillPayload({ botId: "bot-9999" })],
    ["봇 id가 등록되지 않음", { findChannel: vi.fn(async () => ({ ...CHANNEL, external_id: null })) }],
    ["형식이 틀린 요청", {}, { hello: "world" }],
    ["토큰 형식이 틀림", {}, undefined, "../../etc"],
  ];
  it.each(cases)("%s", async (_name, over, payload, token) => {
    const { deps } = makeDeps(over);
    expect(await run(deps, payload ?? skillPayload(), 10_000, token ?? TOKEN)).toEqual(guidanceResponse());
    expect(deps.recordCustomerMessage).not.toHaveBeenCalled();
    expect(deps.runConsult).not.toHaveBeenCalled();
  });

  it("CONSULT_HASH_KEY가 없으면 DB도 보지 않고 기본 안내 (기능 꺼짐)", async () => {
    const { deps } = makeDeps({ hashKey: () => null });
    expect(await run(deps)).toEqual(guidanceResponse());
    expect(deps.findChannel).not.toHaveBeenCalled();
  });

  it("DB 오류로 손님 메시지를 못 남기면 기본 안내", async () => {
    const { deps } = makeDeps({ recordCustomerMessage: vi.fn(async () => null) });
    expect(await run(deps)).toEqual(guidanceResponse());
    expect(deps.runConsult).not.toHaveBeenCalled();
  });
});

describe("로그", () => {
  it("손님 글·손님 id를 남기지 않는다 (길이·의도만)", async () => {
    const { deps, logs, flush } = makeDeps({ engineMs: 4_000 });
    await run(deps, skillPayload({ utterance: "강습료 얼마예요? 010-0000-1234" }), 3_500);
    await flush();
    const all = JSON.stringify(logs);
    expect(logs.length).toBeGreaterThan(0);
    expect(all).not.toContain("강습료");
    expect(all).not.toContain("010-0000-1234");
    expect(all).not.toContain("kakao-user-0001");
    expect(all).toContain('"len"');
  });
});

describe("라우트 (Request → Response)", () => {
  const req = (body: string) => new Request(`http://localhost/api/webhooks/kakao/${TOKEN}`, { method: "POST", body, headers: { "content-type": "application/json" } });

  it("JSON이 아니어도 200 + 기본 안내 스킬 응답", async () => {
    const { deps } = makeDeps();
    const res = await kakaoRoute(req("not json"), TOKEN, deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(await res.json()).toEqual(guidanceResponse());
  });

  it("정상 요청은 200 + 스킬 응답", async () => {
    const { deps, flush } = makeDeps();
    const p = kakaoRoute(req(JSON.stringify(skillPayload())), TOKEN, deps);
    await vi.advanceTimersByTimeAsync(500);
    const res = await p;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(simpleTextResponse(AUTO.reply));
    await flush();
  });

  it("너무 큰 본문은 읽지 않고 기본 안내", async () => {
    const { deps } = makeDeps();
    const res = await kakaoRoute(req(JSON.stringify({ ...skillPayload(), pad: "x".repeat(70_000) })), TOKEN, deps);
    expect(await res.json()).toEqual(guidanceResponse());
    expect(deps.findChannel).not.toHaveBeenCalled();
  });
});
