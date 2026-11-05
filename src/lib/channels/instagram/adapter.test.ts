// P22-4 인스타 어댑터: 24시간·7일 메시지 창 경계(시각 주입), 서명 검증(원문 바이트·상수 시간), 웹훅 해석(에코·스토리·리액션·첨부), Send API 형식.
import { describe, expect, it, vi } from "vitest";
import { canSendInstagram, InstagramAdapter, parseWebhook, verifySignature } from "./adapter";
import { IG_ACCOUNT, IG_CUSTOMER, igMessaging, igPayload, igSign, igText } from "./fixtures";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const LAST = new Date("2026-12-20T01:00:00Z");
const at = (ms: number) => new Date(LAST.getTime() + ms);
const target = { externalUserId: IG_CUSTOMER, lastCustomerMessageAt: LAST };

describe("canSend 메시지 창 (자동 경로 = 사장님 승인 없음)", () => {
  it("23:59 → 보낼 수 있다(RESPONSE)", () => {
    expect(canSendInstagram(target, at(23 * HOUR + 59 * MIN))).toEqual({ ok: true, tag: "RESPONSE" });
  });
  it("정확히 24:00까지는 보낼 수 있다", () => {
    expect(canSendInstagram(target, at(DAY)).ok).toBe(true);
  });
  it("24:01 → 자동 경로는 거부", () => {
    const r = canSendInstagram(target, at(DAY + MIN));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("window_24h");
  });
  it("6일 23:59라도 자동 경로는 거부", () => {
    expect(canSendInstagram(target, at(7 * DAY - MIN)).ok).toBe(false);
  });
  it("손님 메시지가 없으면 먼저 보낼 수 없다", () => {
    expect(canSendInstagram({ externalUserId: IG_CUSTOMER, lastCustomerMessageAt: null }, at(0)).reason).toBe("no_customer_message");
  });
});

describe("canSend 사장님 승인 (HUMAN_AGENT)", () => {
  const owner = { approvedByOwner: true, humanAgent: true };
  it("24시간 안에는 승인해도 일반 답장(RESPONSE)", () => {
    expect(canSendInstagram(target, at(2 * HOUR), owner)).toEqual({ ok: true, tag: "RESPONSE" });
  });
  it("24:01 + 사장님 승인 → HUMAN_AGENT", () => {
    expect(canSendInstagram(target, at(DAY + MIN), owner)).toEqual({ ok: true, tag: "HUMAN_AGENT" });
  });
  it("6일 23:59 + 사장님 승인 → HUMAN_AGENT", () => {
    expect(canSendInstagram(target, at(7 * DAY - MIN), owner)).toEqual({ ok: true, tag: "HUMAN_AGENT" });
  });
  it("7일 + 1분 → 승인해도 거부", () => {
    const r = canSendInstagram(target, at(7 * DAY + MIN), owner);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("window_7d");
  });
  it("Human Agent 심사 전(META_HUMAN_AGENT 꺼짐)이면 24시간 뒤는 승인해도 거부", () => {
    expect(canSendInstagram(target, at(DAY + MIN), { approvedByOwner: true, humanAgent: false }).reason).toBe("human_agent_off");
  });
});

describe("서명 검증", () => {
  const secret = "test-app-secret";
  const raw = new TextEncoder().encode(JSON.stringify(igPayload(igMessaging(igText("강습료 얼마예요?")))));
  it("원문 바이트 HMAC이 맞으면 통과", () => {
    expect(verifySignature(raw, igSign(raw, secret), secret)).toBe(true);
  });
  it("한 바이트라도 다르면 거부", () => {
    const changed = raw.slice();
    changed[10] ^= 1;
    expect(verifySignature(changed, igSign(raw, secret), secret)).toBe(false);
  });
  it("다른 시크릿·접두사 없음·길이 다름·헤더 없음은 거부(예외 없이)", () => {
    expect(verifySignature(raw, igSign(raw, "other"), secret)).toBe(false);
    expect(verifySignature(raw, igSign(raw, secret).slice(7), secret)).toBe(false);
    expect(verifySignature(raw, "sha256=abcd", secret)).toBe(false);
    expect(verifySignature(raw, null, secret)).toBe(false);
  });
});

describe("웹훅 해석", () => {
  it("글 메시지", () => {
    const [e] = parseWebhook(igPayload(igMessaging(igText("강습료 얼마예요?"))));
    expect(e).toMatchObject({ kind: "text", accountId: IG_ACCOUNT, senderId: IG_CUSTOMER, text: "강습료 얼마예요?", mid: "aWdfZAG1faXRlbTox-mid-0001" });
  });
  it("에코(우리가 보낸 것)는 echo, 계정 id는 sender", () => {
    const [e] = parseWebhook(igPayload(igMessaging({ ...igText("답장"), is_echo: true }, { sender: IG_ACCOUNT, recipient: IG_CUSTOMER })));
    expect(e).toMatchObject({ kind: "echo", accountId: IG_ACCOUNT });
  });
  it("스토리 답장·스토리 멘션·첨부·지원 안 함은 표시 글만(첨부 주소는 남기지 않는다)", () => {
    const evs = parseWebhook(
      igPayload(
        igMessaging({ mid: "m1", text: "멋져요", reply_to: { story: { id: "s1", url: "https://cdn.example/story" } } }),
        igMessaging({ mid: "m2", attachments: [{ type: "story_mention", payload: { url: "https://cdn.example/x" } }] }),
        igMessaging({ mid: "m3", attachments: [{ type: "image", payload: { url: "https://cdn.example/img" } }] }),
        igMessaging({ mid: "m4", is_unsupported: true }),
      ),
    );
    expect(evs.map((e) => [e.kind, e.text])).toEqual([
      ["story_reply", "[스토리 답장] 멋져요"],
      ["story_mention", "[스토리 멘션]"],
      ["attachment", "[첨부: image]"],
      ["unsupported", "[지원하지 않는 메시지]"],
    ]);
    expect(JSON.stringify(evs)).not.toContain("cdn.example");
  });
  it("리액션·읽음은 메시지가 아니다", () => {
    const evs = parseWebhook(
      igPayload(igMessaging(null, { extra: { reaction: { mid: "m1", action: "react", reaction: "love" } } }), igMessaging(null, { extra: { read: { mid: "m1" } } })),
    );
    expect(evs.map((e) => e.kind)).toEqual(["reaction", "read"]);
  });
  it("인스타가 아닌 object·형식 오류는 빈 목록", () => {
    expect(parseWebhook({ object: "page", entry: [] })).toEqual([]);
    expect(parseWebhook("x")).toEqual([]);
    expect(parseWebhook({ object: "instagram", entry: [{ messaging: ["x"] }] })).toEqual([]);
  });
  it("receive는 글 메시지만 정규화", () => {
    const a = new InstagramAdapter({ config: { graphBase: "https://g", apiVersion: "v24.0", humanAgent: false }, accountId: IG_ACCOUNT, accessToken: "t" });
    expect(a.receive(igMessaging(igText("안녕하세요")))).toMatchObject({ channel: "instagram", externalUserId: IG_CUSTOMER, text: "안녕하세요", accountId: IG_ACCOUNT });
    expect(a.receive(igMessaging({ ...igText("x"), is_echo: true }))).toBeNull();
  });
});

describe("send (가짜 Graph 서버)", () => {
  function adapter(now: Date, status = 200, humanAgent = true) {
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      void url;
      void init;
      return new Response(JSON.stringify({ recipient_id: IG_CUSTOMER, message_id: "out-1" }), { status });
    });
    const a = new InstagramAdapter({
      config: { graphBase: "https://graph.example", apiVersion: "v24.0", humanAgent },
      accountId: IG_ACCOUNT,
      accessToken: "test-token",
      fetchImpl,
      now: () => now,
    });
    return { a, fetchImpl };
  }
  const sentBody = (f: ReturnType<typeof adapter>["fetchImpl"]) => JSON.parse(String(f.mock.calls[0][1].body));

  it("24시간 안: RESPONSE로 계정 messages 주소에 Bearer 토큰과 함께 보낸다", async () => {
    const { a, fetchImpl } = adapter(at(HOUR));
    expect(await a.send(target, "안내드려요")).toEqual({ ok: true, status: "sent", tag: "RESPONSE" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`https://graph.example/v24.0/${IG_ACCOUNT}/messages`);
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-token");
    expect(sentBody(fetchImpl)).toEqual({ recipient: { id: IG_CUSTOMER }, message: { text: "안내드려요" }, messaging_type: "RESPONSE" });
  });
  it("24:01 자동 경로는 보내지 않는다(skipped, HTTP 호출 없음)", async () => {
    const { a, fetchImpl } = adapter(at(DAY + MIN));
    expect(await a.send(target, "안내드려요")).toMatchObject({ ok: false, status: "skipped", reason: "window_24h" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("24:01 사장님 승인 → MESSAGE_TAG + HUMAN_AGENT", async () => {
    const { a, fetchImpl } = adapter(at(DAY + MIN));
    expect(await a.send(target, "확인했어요", { approvedByOwner: true })).toEqual({ ok: true, status: "sent", tag: "HUMAN_AGENT" });
    expect(sentBody(fetchImpl)).toMatchObject({ messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" });
  });
  it("1000바이트를 넘는 글은 잘라서 보낸다", async () => {
    const { a, fetchImpl } = adapter(at(HOUR));
    await a.send(target, "가".repeat(600)); // 1800바이트
    expect(new TextEncoder().encode(sentBody(fetchImpl).message.text).length).toBeLessThanOrEqual(1000);
  });
  it("Graph 오류는 failed (다시 보내지 않는다)", async () => {
    const { a, fetchImpl } = adapter(at(HOUR), 400);
    expect(await a.send(target, "x")).toMatchObject({ ok: false, status: "failed", reason: "http_400" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
