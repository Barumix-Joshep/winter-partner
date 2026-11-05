// P22-5 사장님 인박스: 가짜 웹훅(인스타 서명 DM·카카오 스킬)으로 문의를 만들고, 인박스가 새로고침 없이 갱신(10초 확인) → 대기 배지 →
// 인스타 상세(수정 → AI 답변 틀림(고친 답) → KB에 추가(꺼진 채) → 승인·발송(가짜 Graph, RESPONSE) → 24시간~7일·7일 초과 거부) →
// 카카오 상세(무료 챗봇 안내 + 복사 → 답장함) → 자동응답 기록 탭 → 다른 샵 차단. 390px에서 가로 넘침 없음.
// 실제 메타·카카오·AI는 부르지 않는다(AI_MOCK=1, Graph는 localhost 가짜 서버, 메타 값·암호화 키는 playwright.config.ts의 시험용 값).
// 다른 테스트에 영향이 없게 강습팀(shop3)을 쓰고 끝나면 되돌린다.
import { createCipheriv, createHmac, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { admin, login, userClient } from "./helpers";

const SHOP3 = "b0000000-0000-0000-0000-000000000003";
const ACCOUNT = "17841400000000088";
const SECRET = "e2e-only-meta-app-secret-not-a-secret"; // playwright.config.ts와 같은 시험용 값
const ENC_KEY = Buffer.from("e2e-only-consult-enc-key-32bytes"); // playwright.config.ts와 같은 시험용 32바이트
const GRAPH_PORT = 3198; // playwright.config.ts IG_FAKE_GRAPH_PORT
const BOT = "bot-e2e-inbox";
const IG_Q = "12월 20일 2명 예약 가능할까요?";
const KK_Q = "12월 21일 3명 예약 가능할까요?";
const KB_TITLE = IG_Q;

type Hit = { url: string; body: Record<string, unknown> };
let hits: Hit[] = [];
let server: Server;
let igChannel = "";
let kkChannel = "";
let kkToken = "";

test.use({ viewport: { width: 390, height: 844 } });
test.describe.configure({ mode: "serial" });

function encrypt(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return "v1." + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

async function igDm(request: APIRequestContext, mid: string, text: string, sender: string) {
  const raw = JSON.stringify({
    object: "instagram",
    entry: [{ id: ACCOUNT, time: Date.now(), messaging: [{ sender: { id: sender }, recipient: { id: ACCOUNT }, timestamp: Date.now(), message: { mid, text } }] }],
  });
  const res = await request.post("/api/webhooks/instagram", {
    data: raw,
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + createHmac("sha256", SECRET).update(raw).digest("hex") },
  });
  expect(res.status()).toBe(200);
}

async function kakao(request: APIRequestContext, utterance: string, user: string) {
  const res = await request.post(`/api/webhooks/kakao/${kkToken}`, {
    data: {
      intent: { id: "i1", name: "폴백 블록" },
      userRequest: { timezone: "Asia/Seoul", block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties: {} } },
      bot: { id: BOT, name: "[테스트] 평창 라이딩스쿨" },
      action: { id: "a1", name: "winter-partner", params: {}, detailParams: {}, clientExtra: {} },
    },
  });
  expect(res.status()).toBe(200);
}

async function convOf(channelId: string, question: string) {
  const { data: m } = await admin().from("messages").select("conversation_id").eq("shop_id", SHOP3).eq("text", question).limit(1).single();
  const { data: c } = await admin().from("conversations").select("channel_id").eq("id", m!.conversation_id).single();
  expect(c?.channel_id).toBe(channelId);
  return m!.conversation_id as string;
}

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      hits.push({ url: req.url ?? "", body: JSON.parse(raw || "{}") });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ recipient_id: "x", message_id: "out" }));
    });
  });
  await new Promise<void>((r) => server.listen(GRAPH_PORT, "127.0.0.1", r));
  const db = admin();
  const { data: ig, error } = await db
    .from("shop_channels")
    .upsert({ shop_id: SHOP3, channel: "instagram", external_id: ACCOUNT, credentials_enc: encrypt("e2e-ig-token"), enabled: true, token_expires_at: new Date(Date.now() + 50 * 86_400_000).toISOString() }, { onConflict: "shop_id,channel" })
    .select("id")
    .single();
  if (error) throw error;
  igChannel = ig.id;
  const { data: kk, error: e2 } = await db.from("shop_channels").upsert({ shop_id: SHOP3, channel: "kakao", external_id: BOT, enabled: true }, { onConflict: "shop_id,channel" }).select("id, public_token").single();
  if (e2) throw e2;
  kkChannel = kk.id;
  kkToken = kk.public_token;
  await db.from("shop_knowledge").update({ content: "[테스트] 1:1 2시간 120,000원", is_active: true }).eq("shop_id", SHOP3).eq("title", "강습료");
  await db.from("shop_consult_settings").update({ auto_reply_enabled: true, disclose_first_reply: true }).eq("shop_id", SHOP3);
});

test.afterAll(async () => {
  server?.close();
  const db = admin();
  await db.from("inquiries").delete().eq("shop_id", SHOP3).not("conversation_id", "is", null);
  await db.from("shop_channels").delete().in("id", [igChannel, kkChannel]); // 대화·메시지·피드백은 함께 지워진다(로컬 시험 데이터)
  await db.from("shop_knowledge").delete().eq("shop_id", SHOP3).eq("title", KB_TITLE);
  await db.from("shop_knowledge").update({ is_active: false }).eq("shop_id", SHOP3);
  await db.from("shop_consult_settings").update({ auto_reply_enabled: false }).eq("shop_id", SHOP3);
});

test.beforeEach(() => {
  hits = [];
});

test("인박스: 웹훅으로 온 문의가 새로고침 없이 나타나고, 사장님 대기가 먼저·메뉴에 대기 수", async ({ page, request }) => {
  await login(page, "team@winter.test");
  await page.goto("/shop/ai-consult/inbox");
  await expect(page.getByText("아직 받은 상담이 없습니다.")).toBeVisible();

  await igDm(request, "e2e-inbox-mid-1", IG_Q, "e2e-inbox-ig-1");
  await kakao(request, KK_Q, "e2e-inbox-kakao-1");
  await igDm(request, "e2e-inbox-mid-2", "강습료 얼마예요?", "e2e-inbox-ig-2"); // 자동응답(기록 탭용)
  await expect.poll(async () => (await admin().from("conversations").select("id").eq("shop_id", SHOP3)).data?.length ?? 0, { timeout: 20_000 }).toBe(3);
  await expect.poll(async () => (await admin().from("messages").select("id").eq("shop_id", SHOP3).eq("role", "ai")).data?.length ?? 0, { timeout: 20_000 }).toBe(1);
  await expect.poll(() => hits.length, { timeout: 20_000 }).toBe(2); // 인스타: 사장님께 전달 안내 + 자동 답변

  // 새로고침하지 않아도 10초 확인으로 갱신
  const list = page.getByRole("list", { name: "상담 목록" });
  await expect(list.getByRole("listitem")).toHaveCount(3, { timeout: 30_000 });
  await expect(list.getByRole("listitem").nth(0)).toContainText("사장님 대기");
  await expect(list.getByRole("listitem").nth(1)).toContainText("사장님 대기");
  await expect(list.getByRole("listitem").nth(2)).toContainText("AI 응대");
  await expect(page.getByText("사장님 대기 2건")).toBeVisible();
  await expect(page.getByRole("link", { name: "AI 상담 대기 2건" }).first()).toBeAttached();
  expect(await noOverflow(page)).toBe(true);
});

test("인스타 상세: 초안 수정 → 틀림(고친 답) → KB에 추가(꺼진 채) → 승인·발송(RESPONSE) → 24시간~7일·7일 초과는 거부", async ({ page }) => {
  const conv = await convOf(igChannel, IG_Q);
  await login(page, "team@winter.test");
  await page.goto("/shop/ai-consult/inbox");
  await page.getByRole("link").filter({ hasText: IG_Q }).click();
  await page.waitForURL(`**/shop/ai-consult/inbox/${conv}`);

  await expect(page.getByRole("article", { name: "손님 메시지" })).toContainText(IG_Q);
  await expect(page.getByRole("article", { name: "안내 메시지" })).toContainText("사장님께 전달했어요");
  const info = page.getByRole("region", { name: "문의 정보" });
  await expect(info).toContainText("2명");
  await expect(info).toContainText("12월 20일");
  await expect(info).toContainText("연락처");

  const box = page.getByRole("textbox", { name: /답장/ });
  await expect(box).toHaveValue(/\[초안\] 문의 주셔서 감사합니다/);
  await expect(box).not.toBeEditable();
  await page.getByRole("button", { name: "수정" }).click();
  const answer = "[테스트] 12월 20일 2명 가능합니다. 10시에 뵐게요.";
  await box.fill(answer);
  expect(await noOverflow(page)).toBe(true);

  await page.getByRole("button", { name: "AI 답변 틀림" }).click();
  await expect(page.getByText("고친 답과 함께 'AI 답변 틀림'으로 기록했어요.")).toBeVisible();
  const { data: fb } = await admin().from("ai_feedback").select("kind, corrected_text").eq("shop_id", SHOP3);
  expect(fb).toEqual([{ kind: "edited", corrected_text: answer }]);

  await page.getByRole("button", { name: "KB에 추가" }).click();
  const kb = page.getByRole("form", { name: "안내 정보에 추가" });
  await expect(kb.getByLabel("제목")).toHaveValue(IG_Q);
  await expect(kb.getByLabel("내용")).toHaveValue(answer);
  await expect(kb.getByLabel("AI 답변에 사용")).not.toBeChecked();
  await kb.getByRole("button", { name: "안내 정보 저장" }).click();
  await expect(kb.getByText("저장했습니다.")).toBeVisible();
  const { data: item } = await admin().from("shop_knowledge").select("kind, content, is_active").eq("shop_id", SHOP3).eq("title", KB_TITLE).single();
  expect(item).toEqual({ kind: "faq", content: answer, is_active: false });

  await page.getByRole("button", { name: "승인·발송(인스타)" }).click();
  await expect(page.getByText("인스타그램으로 보냈어요.")).toBeVisible();
  expect(hits).toHaveLength(1);
  expect(hits[0].url).toBe(`/v24.0/${ACCOUNT}/messages`);
  expect(hits[0].body).toMatchObject({ recipient: { id: "e2e-inbox-ig-1" }, messaging_type: "RESPONSE", message: { text: answer } });
  const { data: owner } = await admin().from("messages").select("delivery_status, tag").eq("conversation_id", conv).eq("role", "owner");
  expect(owner).toEqual([{ delivery_status: "sent", tag: "RESPONSE" }]);
  await expect.poll(async () => (await admin().from("inquiries").select("status").eq("conversation_id", conv).single()).data?.status).toBe("replied");
  await expect(page.getByRole("article", { name: "사장님 메시지" })).toContainText(answer);

  // 24시간~7일: Human Agent 심사 전(시험 설정에 META_HUMAN_AGENT 없음) → 보내지 않고 안내
  await admin().from("conversations").update({ last_customer_message_at: new Date(Date.now() - 2 * 86_400_000).toISOString() }).eq("id", conv);
  await page.getByRole("button", { name: "승인·발송(인스타)" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Human Agent" })).toBeVisible();
  // 7일 초과 → 거부
  await admin().from("conversations").update({ last_customer_message_at: new Date(Date.now() - 8 * 86_400_000).toISOString() }).eq("id", conv);
  await page.getByRole("button", { name: "승인·발송(인스타)" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "7일" })).toBeVisible();
  expect(hits).toHaveLength(1);
  expect((await admin().from("messages").select("id").eq("conversation_id", conv).eq("role", "owner")).data).toHaveLength(1);
});

test("카카오 상세: 무료 챗봇 안내 + 복사(클립보드 쓰기) → 답장함", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const conv = await convOf(kkChannel, KK_Q);
  await login(page, "team@winter.test");
  await page.goto(`/shop/ai-consult/inbox/${conv}`);
  await expect(page.getByRole("note")).toHaveText("무료 챗봇은 먼저 말을 걸 수 없어요 — 채널 1:1 채팅에서 답해 주세요");
  await expect(page.getByRole("button", { name: "승인·발송(인스타)" })).toHaveCount(0);
  const draft = await page.getByRole("textbox", { name: /답장/ }).inputValue();
  expect(draft).toContain("[초안]");
  await page.getByRole("button", { name: "복사(카카오)" }).click();
  await expect(page.getByText(/복사했어요/)).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(draft);
  const { data: owner } = await admin().from("messages").select("delivery_status, tag, text").eq("conversation_id", conv).eq("role", "owner");
  expect(owner).toEqual([{ delivery_status: "skipped", tag: null, text: draft }]);
  expect((await admin().from("inquiries").select("status").eq("conversation_id", conv).single()).data?.status).toBe("replied");
  expect(await noOverflow(page)).toBe(true);
});

test("자동응답 기록 탭: AI 답변의 의도·신뢰도·발송 결과, 틀림 기록", async ({ page }) => {
  await login(page, "team@winter.test");
  await page.goto("/shop/ai-consult/inbox");
  await page.getByRole("link", { name: "자동응답 기록" }).click();
  await expect(page.getByText(/자동응답 1건/)).toBeVisible();
  const item = page.getByRole("list", { name: "자동응답 목록" }).getByRole("listitem");
  await expect(item).toContainText("의도: 가격");
  await expect(item).toContainText("신뢰도 92%");
  await expect(item).toContainText("보냄 · RESPONSE");
  await expect(item).toContainText("120,000원");
  await item.getByRole("button", { name: "AI 답변 틀림" }).click();
  await expect(item.getByText("'AI 답변 틀림'으로 기록했어요.")).toBeVisible();
  expect((await admin().from("ai_feedback").select("kind").eq("shop_id", SHOP3).eq("kind", "wrong")).data).toHaveLength(1);
  expect(await noOverflow(page)).toBe(true);
  // 다른 날은 0건
  await page.getByLabel("날짜", { exact: true }).fill("2026-01-01");
  await page.getByRole("button", { name: "보기" }).click();
  await expect(page.getByText("2026-01-01 자동응답 0건")).toBeVisible();
});

test("다른 샵은 대화를 볼 수 없고 답장도 기록할 수 없다", async ({ page }) => {
  const conv = await convOf(igChannel, IG_Q);
  await login(page, "shop1@winter.test");
  await page.goto("/shop/ai-consult/inbox");
  await expect(page.getByText("아직 받은 상담이 없습니다.")).toBeVisible();
  await page.goto(`/shop/ai-consult/inbox/${conv}`);
  await expect(page.getByText("찾는 화면이 없습니다")).toBeVisible();
  await expect(page.getByText(IG_Q)).toHaveCount(0);

  const other = await userClient("shop1@winter.test");
  const { error } = await other.rpc("consult_owner_reply", { p_conversation_id: conv, p_text: "가짜 답", p_delivery_status: "skipped", p_tag: null });
  expect(error?.code).toBe("42501");
  const own = await userClient("team@winter.test");
  const { error: colErr } = await own.from("conversations").select("reply_to_enc").eq("id", conv);
  expect(colErr?.code).toBe("42501"); // 손님 인스타 id(암호화)는 자기 샵도 못 읽는다
  const { data: stored } = await admin().from("conversations").select("reply_to_enc").eq("id", conv).single();
  expect(stored?.reply_to_enc).toMatch(/^v1\./);
});
