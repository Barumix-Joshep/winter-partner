// P22-4 인스타 웹훅: GET 구독 확인, 서명 실패 400, 서명 맞는 DM → 200 → after()에서 저장·자동 답변(가짜 Graph 서버에 RESPONSE로 한 번),
// 같은 mid 재전송은 한 번만, 에코는 저장 안 함, 스토리 멘션은 저장만(답장 없음), 안내 정보 화면의 연결 버튼.
// 실제 메타·AI는 부르지 않는다(AI_MOCK=1, Graph는 localhost 가짜 서버, 메타 값·암호화 키는 playwright.config.ts의 시험용 값).
// 다른 테스트에 영향이 없게 강습팀(shop3)을 쓰고 끝나면 되돌린다.
import { createCipheriv, createHmac, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { admin, login } from "./helpers";

const SHOP3 = "b0000000-0000-0000-0000-000000000003";
const ACCOUNT = "17841400000000077";
const SECRET = "e2e-only-meta-app-secret-not-a-secret"; // playwright.config.ts와 같은 시험용 값
const ENC_KEY = Buffer.from("ZTJlLW9ubHktY29uc3VsdC1lbmMta2V5LTMyYnl0ZXM=", "base64");
const GRAPH_PORT = 3198; // playwright.config.ts IG_FAKE_GRAPH_PORT

type Hit = { url: string; auth: string | undefined; body: Record<string, unknown> };
let hits: Hit[] = [];
let server: Server;
let channelId = "";

// 앱과 같은 형식(v1.<base64(iv|tag|암호문)>)으로 시험용 토큰을 암호화
function encrypt(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return "v1." + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

function dm(message: Record<string, unknown>, sender = "e2e-ig-user-1") {
  return { object: "instagram", entry: [{ id: ACCOUNT, time: Date.now(), messaging: [{ sender: { id: sender }, recipient: { id: ACCOUNT }, timestamp: Date.now(), message }] }] };
}

async function hook(request: APIRequestContext, body: unknown, secret = SECRET) {
  const raw = JSON.stringify(body);
  return request.post("/api/webhooks/instagram", {
    data: raw,
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + createHmac("sha256", secret).update(raw).digest("hex") },
  });
}

async function messages() {
  const { data } = await admin().from("messages").select("role, text, delivery_status, tag, channel_message_id").eq("shop_id", SHOP3).eq("channel", "instagram").order("sent_at");
  return data ?? [];
}

test.beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      hits.push({ url: req.url ?? "", auth: req.headers.authorization, body: JSON.parse(raw || "{}") });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ recipient_id: "x", message_id: "out" }));
    });
  });
  await new Promise<void>((r) => server.listen(GRAPH_PORT, "127.0.0.1", r));

  const db = admin();
  const { data: ch, error } = await db
    .from("shop_channels")
    .upsert({ shop_id: SHOP3, channel: "instagram", external_id: ACCOUNT, credentials_enc: encrypt("e2e-ig-token"), enabled: true, token_expires_at: new Date(Date.now() + 50 * 86_400_000).toISOString() }, { onConflict: "shop_id,channel" })
    .select("id")
    .single();
  if (error) throw error;
  channelId = ch.id;
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
});

test("GET 구독 확인: verify token이 맞으면 challenge, 틀리면 403", async ({ request }) => {
  const ok = await request.get("/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=e2e-verify-token&hub.challenge=987654321");
  expect(ok.status()).toBe(200);
  expect(await ok.text()).toBe("987654321");
  expect((await request.get("/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1")).status()).toBe(403);
});

test("서명이 틀리면 400, 저장하지 않는다", async ({ request }) => {
  const res = await hook(request, dm({ mid: "e2e-mid-bad", text: "강습료 얼마예요?" }), "wrong-secret");
  expect(res.status()).toBe(400);
  await new Promise((r) => setTimeout(r, 1_000));
  expect((await messages()).some((m) => m.channel_message_id === "e2e-mid-bad")).toBe(false);
});

test("안내 정보 질문 DM: 200 → 저장·자동 답변(RESPONSE, 첫 답변 고지) 한 번, 같은 mid 재전송은 무시", async ({ request }) => {
  const body = dm({ mid: "e2e-mid-1", text: "강습료 얼마예요?" });
  const res = await hook(request, body);
  expect(res.status()).toBe(200);
  await expect.poll(() => hits.length, { timeout: 15_000 }).toBe(1);
  expect(hits[0].url).toBe(`/v24.0/${ACCOUNT}/messages`);
  expect(hits[0].auth).toBe("Bearer e2e-ig-token");
  expect(hits[0].body).toMatchObject({ recipient: { id: "e2e-ig-user-1" }, messaging_type: "RESPONSE" });
  const text = (hits[0].body.message as { text: string }).text;
  expect(text).toContain("AI가 샵 안내 정보로 드리는 자동 답변");
  expect(text).toContain("120,000원");
  await expect.poll(async () => (await messages()).find((m) => m.role === "ai")?.delivery_status).toBe("sent");
  expect((await messages()).find((m) => m.role === "ai")?.tag).toBe("RESPONSE");

  expect((await hook(request, body)).status()).toBe(200); // 메타 재전송
  await new Promise((r) => setTimeout(r, 2_000));
  expect(hits).toHaveLength(1);
  expect((await messages()).filter((m) => m.channel_message_id === "e2e-mid-1")).toHaveLength(1);
  const { data: conv } = await admin().from("conversations").select("external_user_hash").eq("channel_id", channelId);
  expect(conv![0].external_user_hash).toMatch(/^[0-9a-f]{64}$/); // 손님 id 원문은 저장하지 않는다
});

test("에코는 저장하지 않고, 스토리 멘션은 저장만(답장 없음)", async ({ request }) => {
  const echo = { object: "instagram", entry: [{ id: ACCOUNT, time: Date.now(), messaging: [{ sender: { id: ACCOUNT }, recipient: { id: "e2e-ig-user-1" }, timestamp: Date.now(), message: { mid: "e2e-mid-echo", text: "우리 답장", is_echo: true } }] }] };
  expect((await hook(request, echo)).status()).toBe(200);
  expect((await hook(request, dm({ mid: "e2e-mid-story", attachments: [{ type: "story_mention", payload: { url: "https://cdn.example/s" } }] }, "e2e-ig-user-2"))).status()).toBe(200);
  await expect.poll(async () => (await messages()).find((m) => m.channel_message_id === "e2e-mid-story")?.text).toBe("[스토리 멘션]");
  await new Promise((r) => setTimeout(r, 1_500));
  expect((await messages()).some((m) => m.channel_message_id === "e2e-mid-echo")).toBe(false);
  expect(hits).toHaveLength(0);
});

test("안내 정보 화면: 연결된 인스타는 '연결됨'과 해제 버튼", async ({ page }) => {
  await login(page, "team@winter.test");
  await page.goto("/shop/ai-consult/knowledge");
  const section = page.getByRole("region", { name: "인스타그램 연결" });
  await expect(section).toContainText("연결됨");
  await expect(section.getByRole("button", { name: "연결 해제" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
