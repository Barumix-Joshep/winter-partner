// P22-3 카카오 스킬 웹훅: 즉답(첫 답변 고지)·escalate(상담 연결·문의)·중복 발화·꺼진 채널·봇 id 불일치,
// 콜백 경로(가짜 모델 지연 → useCallback → 가짜 콜백 서버에 한 번만 POST, 실패는 failed 기록).
// 실제 카카오·AI는 부르지 않는다(AI_MOCK=1, 콜백 서버는 localhost). 다른 화면 테스트에 영향이 없게 강습팀(shop3)을 쓰고 끝나면 되돌린다.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { admin } from "./helpers";

const SHOP3 = "b0000000-0000-0000-0000-000000000003";
const BOT = "bot-e2e-0001";
let token = "";
let channelId = "";

type Hit = { body: unknown };
let hits: Hit[] = [];
let callbackStatus = 200;
let server: Server;
let callbackBase = "";

function payload(utterance: string, opts: { user?: string; bot?: string; callback?: string | null } = {}) {
  return {
    intent: { id: "i1", name: "폴백 블록" },
    userRequest: {
      timezone: "Asia/Seoul",
      block: { id: "b1", name: "폴백 블록" },
      utterance,
      lang: "ko",
      user: { id: opts.user ?? "e2e-kakao-user-1", type: "botUserKey", properties: {} },
      ...(opts.callback === null ? {} : { callbackUrl: opts.callback ?? `${callbackBase}/cb` }),
    },
    bot: { id: opts.bot ?? BOT, name: "[테스트] 평창 라이딩스쿨" },
    action: { id: "a1", name: "winter-partner", params: {}, detailParams: {}, clientExtra: {} },
  };
}

async function skill(request: APIRequestContext, body: unknown, t = token) {
  const started = Date.now();
  const res = await request.post(`/api/webhooks/kakao/${t}`, { data: body });
  expect(res.status()).toBe(200);
  return { json: await res.json(), ms: Date.now() - started };
}

const textOf = (j: { template?: { outputs: Record<string, { text?: string; description?: string }>[] } }) => {
  const o = j.template?.outputs[0] ?? {};
  return o.simpleText?.text ?? o.textCard?.description ?? "";
};

async function lastMessages(userLimit = 20) {
  const { data } = await admin().from("messages").select("role, text, delivery_status, prompt_version, intent").eq("shop_id", SHOP3).order("sent_at", { ascending: false }).limit(userLimit);
  return data ?? [];
}

test.beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      hits.push({ body: JSON.parse(raw || "null") });
      res.writeHead(callbackStatus, { "content-type": "application/json" });
      res.end(JSON.stringify({ taskId: "t", status: callbackStatus === 200 ? "SUCCESS" : "FAIL" }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  callbackBase = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const db = admin();
  const { data: ch, error } = await db
    .from("shop_channels")
    .upsert({ shop_id: SHOP3, channel: "kakao", external_id: BOT, enabled: true }, { onConflict: "shop_id,channel" })
    .select("id, public_token")
    .single();
  if (error) throw error;
  token = ch.public_token;
  channelId = ch.id;
  // 안내 정보(강습료) 사용 + 자동 응대 켜기
  await db.from("shop_knowledge").update({ content: "[테스트] 1:1 2시간 120,000원", is_active: true }).eq("shop_id", SHOP3).eq("title", "강습료");
  await db.from("shop_consult_settings").update({ auto_reply_enabled: true, disclose_first_reply: true }).eq("shop_id", SHOP3);
});

test.afterAll(async () => {
  server?.close();
  const db = admin();
  await db.from("inquiries").delete().eq("shop_id", SHOP3).not("conversation_id", "is", null);
  await db.from("shop_channels").delete().eq("id", channelId); // 대화·메시지는 함께 지워진다(로컬 시험 데이터)
  await db.from("shop_knowledge").update({ is_active: false }).eq("shop_id", SHOP3);
  await db.from("shop_consult_settings").update({ auto_reply_enabled: false }).eq("shop_id", SHOP3);
});

test.beforeEach(() => {
  hits = [];
  callbackStatus = 200;
});

test("안내 정보 질문은 바로 답하고, 첫 답변에만 AI 고지를 붙인다", async ({ request }) => {
  const first = await skill(request, payload("강습료 얼마예요?"));
  expect(first.ms).toBeLessThan(5_000);
  expect(textOf(first.json)).toContain("AI가 샵 안내 정보로 드리는 자동 답변");
  expect(textOf(first.json)).toContain("120,000원");

  const again = await skill(request, payload("1:1 강습 가격이 얼마죠?"));
  expect(textOf(again.json)).toContain("120,000원");
  expect(textOf(again.json)).not.toContain("자동 답변이에요");

  await expect.poll(async () => (await lastMessages()).filter((m) => m.role === "ai").length).toBe(2);
  const ai = (await lastMessages()).find((m) => m.role === "ai");
  expect(ai).toMatchObject({ delivery_status: "sent", intent: "price" });
  expect(ai?.prompt_version).toBeTruthy();
  const { data: conv } = await admin().from("conversations").select("external_user_hash, disclosed_at").eq("channel_id", channelId);
  expect(conv).toHaveLength(1);
  expect(conv![0].disclosed_at).not.toBeNull();
  expect(conv![0].external_user_hash).toMatch(/^[0-9a-f]{64}$/); // 손님 id 원문은 저장하지 않는다
  expect(hits).toHaveLength(0); // 즉답에는 콜백을 쓰지 않는다
});

test("같은 발화가 다시 오면 다시 처리하지 않는다", async ({ request }) => {
  const body = payload("영업시간 알려 주세요", { user: "e2e-kakao-user-dup" });
  await skill(request, body);
  const dup = await skill(request, body);
  expect(textOf(dup.json)).toBe("메시지를 받았어요. 잠시만 기다려 주세요.");
});

test("예약 문의는 상담 연결 버튼으로 답하고 사장님 문의를 연다", async ({ request }) => {
  const r = await skill(request, payload("12월 20일 2명 예약 가능할까요?", { user: "e2e-kakao-user-2" }));
  expect(r.json.template.outputs[0].textCard).toEqual({
    description: "사장님께 전달했어요. 곧 채널 1:1 채팅으로 답드릴게요.",
    buttons: [{ label: "상담 연결", action: "operator" }],
  });
  await expect
    .poll(async () => (await admin().from("inquiries").select("type, status, extracted, ai_draft").eq("shop_id", SHOP3).eq("type", "booking")).data ?? [])
    .toEqual([expect.objectContaining({ type: "booking", status: "open", extracted: { people: 2, date: "12월 20일" } })]);
});

test("3.5초를 넘기면 useCallback으로 답하고, 콜백은 한 번만 보낸다", async ({ request }) => {
  const r = await skill(request, payload("강습료 얼마예요? [가짜:지연]", { user: "e2e-kakao-user-3" }));
  expect(r.json).toEqual({ version: "2.0", useCallback: true, data: { text: "답변을 준비하고 있어요…" } });
  expect(r.ms).toBeLessThan(5_000);
  await expect.poll(() => hits.length, { timeout: 15_000 }).toBe(1);
  // 가짜 모델은 3.5초 타임아웃에 끊긴다 → 사람에게 넘김(상담 연결)
  expect(hits[0].body).toMatchObject({ version: "2.0", template: { outputs: [{ textCard: { buttons: [{ action: "operator" }] } }] } });
  await new Promise((res) => setTimeout(res, 2_000));
  expect(hits).toHaveLength(1);
  await expect.poll(async () => (await lastMessages()).find((m) => m.role === "system")?.delivery_status).toBe("sent");
});

test("콜백이 실패하면 다시 보내지 않고 failed로 남긴다", async ({ request }) => {
  callbackStatus = 500;
  await skill(request, payload("가게 어디에 있어요? [가짜:지연]", { user: "e2e-kakao-user-4" }));
  await expect.poll(() => hits.length, { timeout: 15_000 }).toBe(1);
  await expect.poll(async () => (await lastMessages(1))[0]?.delivery_status).toBe("failed");
  await new Promise((res) => setTimeout(res, 2_000));
  expect(hits).toHaveLength(1);
});

test("토큰이 틀리거나 봇 id가 다르면 기본 안내만", async ({ request }) => {
  const guidance = "지금은 자동 상담을 받을 수 없어요. 샵으로 직접 문의해 주세요.";
  expect(textOf((await skill(request, payload("강습료 얼마예요?"), "0".repeat(48))).json)).toBe(guidance);
  expect(textOf((await skill(request, payload("강습료 얼마예요?"), "not-a-token")).json)).toBe(guidance);
  expect(textOf((await skill(request, payload("강습료 얼마예요?", { bot: "bot-other" }))).json)).toBe(guidance);
  const bad = await request.post(`/api/webhooks/kakao/${token}`, { data: "not json", headers: { "content-type": "application/json" } });
  expect(bad.status()).toBe(200);
  expect(textOf(await bad.json())).toBe(guidance);
});
