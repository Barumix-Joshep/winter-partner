// P23-2 AI 상담 사용권 (가짜 카카오 스킬·가짜 인스타 웹훅, AI_MOCK=1). 켜짐 스위치(consult_license_required)는 이 파일 안에서만 켜고 끝나면 되돌린다.
// 1) 사용권 없는 샵: 카카오·인스타 웹훅이 AI를 부르지 않고(ai_usage 0) 사장님께 넘긴다(상담 연결·"사장님께 전달했어요" 한 번·문의)
// 2) 설정 화면: 켜기 대신 사용권 안내, 인박스 띠, 인스타 새 연결 막힘, DB도 켜기 거부
// 3) 본사가 체험을 주면 켜기 → 첫 자동 답변 → 체험 시작(한국 날짜 10일), 사용량 표시
// 4) 이번 달 포함 응답을 다 쓰면 AI 없이 넘김 + 띠, 5) 본사가 중지하면 자동응답이 꺼지고 켜기가 막힌다
// 실제 카카오·메타·AI는 부르지 않는다. 다른 테스트에 영향이 없게 강습팀(shop3)을 쓰고 끝나면 모두 되돌린다(채널·문의·사용권·사용량·알림).
import { createCipheriv, createHmac, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { countResponses } from "../src/lib/ai/consult/license";
import { admin, login, userClient } from "./helpers";
import { setConsultLicenseRequired } from "./local-sql";

const SHOP3 = "b0000000-0000-0000-0000-000000000003";
const BOT = "bot-e2e-license";
const ACCOUNT = "17841400000000066";
const SECRET = "e2e-only-meta-app-secret-not-a-secret"; // playwright.config.ts와 같은 시험용 값
const ENC_KEY = Buffer.from("e2e-only-consult-enc-key-32bytes"); // playwright.config.ts와 같은 시험용 32바이트
const GRAPH_PORT = 3198; // playwright.config.ts IG_FAKE_GRAPH_PORT
const KAKAO_ESCALATE = "사장님께 전달했어요. 곧 채널 1:1 채팅으로 답드릴게요."; // kakao/format.ts ESCALATE_TEXT
const IG_ESCALATE = "문의 감사합니다! 사장님께 전달했어요. 확인 후 곧 답드릴게요."; // consult/engine.ts ESCALATE_REPLY

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 390, height: 844 } });

type Hit = { url: string; body: { recipient?: { id: string }; message?: { text: string } } };
let hits: Hit[] = [];
let server: Server;
let token = "";
let seq = 0;

function encrypt(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return "v1." + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

async function kakao(request: APIRequestContext, text: string) {
  const res = await request.post(`/api/webhooks/kakao/${token}`, {
    data: {
      intent: { id: "i1", name: "폴백 블록" },
      userRequest: { timezone: "Asia/Seoul", block: { id: "b1", name: "폴백 블록" }, utterance: text, lang: "ko", user: { id: `e2e-lic-kakao-${++seq}`, type: "botUserKey", properties: {} } },
      bot: { id: BOT, name: "[테스트] 평창 라이딩스쿨" },
      action: { id: "a1", name: "winter-partner", params: {}, detailParams: {}, clientExtra: {} },
    },
  });
  expect(res.status()).toBe(200);
  const json = await res.json();
  const o = json.template?.outputs[0] ?? {};
  return { text: (o.simpleText?.text ?? o.textCard?.description ?? "") as string, operator: !!o.textCard?.buttons?.some((b: { action: string }) => b.action === "operator") };
}

async function instagram(request: APIRequestContext, text: string) {
  const user = `e2e-lic-ig-${++seq}`;
  const raw = JSON.stringify({
    object: "instagram",
    entry: [{ id: ACCOUNT, time: Date.now(), messaging: [{ sender: { id: user }, recipient: { id: ACCOUNT }, timestamp: Date.now(), message: { mid: `e2e-lic-mid-${seq}`, text } }] }],
  });
  const res = await request.post("/api/webhooks/instagram", {
    data: raw,
    headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + createHmac("sha256", SECRET).update(raw).digest("hex") },
  });
  expect(res.status()).toBe(200);
  return user;
}

// 상담 AI 호출 수 (가짜 모델도 호출마다 ai_usage 한 행)
async function aiCalls() {
  const { count } = await admin().from("ai_usage").select("id", { count: "exact", head: true }).eq("shop_id", SHOP3).eq("feature", "consult");
  return count ?? 0;
}

// 그 글을 보낸 대화의 답변·문의
async function outcome(text: string) {
  const db = admin();
  const { data: m } = await db.from("messages").select("conversation_id").eq("shop_id", SHOP3).eq("role", "customer").eq("text", text).order("sent_at", { ascending: false }).limit(1).maybeSingle();
  if (!m) return { replies: [], inquiries: [] };
  const conv = m.conversation_id as string;
  const { data: replies } = await db.from("messages").select("role, text, delivery_status").eq("conversation_id", conv).neq("role", "customer");
  const { data: inq } = await db.from("inquiries").select("type, status, ai_draft").eq("conversation_id", conv);
  return { replies: replies ?? [], inquiries: inq ?? [] };
}

async function asAdmin() {
  return userClient("admin@winter.test");
}

async function cleanup() {
  const db = admin();
  await db.from("inquiries").delete().eq("shop_id", SHOP3).not("conversation_id", "is", null);
  await db.from("shop_channels").delete().eq("shop_id", SHOP3); // 대화·메시지는 함께 지워진다(로컬 시험 데이터)
  await db.from("consult_usage_packs").delete().eq("shop_id", SHOP3);
  await db.from("consult_licenses").delete().eq("shop_id", SHOP3);
  await db.from("ai_usage").delete().eq("shop_id", SHOP3);
  await db.from("notifications").delete().like("kind", "consult_%");
  await db.from("shop_knowledge").update({ is_active: false }).eq("shop_id", SHOP3);
  await db.from("shop_consult_settings").update({ auto_reply_enabled: false }).eq("shop_id", SHOP3);
}

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

  await cleanup();
  const db = admin();
  const { data: kk, error } = await db.from("shop_channels").insert({ shop_id: SHOP3, channel: "kakao", external_id: BOT, enabled: true }).select("public_token").single();
  if (error) throw error;
  token = kk.public_token;
  const { error: e2 } = await db
    .from("shop_channels")
    .insert({ shop_id: SHOP3, channel: "instagram", external_id: ACCOUNT, credentials_enc: encrypt("e2e-ig-token"), enabled: true, token_expires_at: new Date(Date.now() + 50 * 86_400_000).toISOString() });
  if (e2) throw e2;
  await db.from("shop_knowledge").update({ content: "[테스트] 1:1 2시간 120,000원", is_active: true }).eq("shop_id", SHOP3).eq("title", "강습료");
  // 스위치를 켜기 전에 켜 둔 자동응답(사용권 없이 켜져 있던 샵) — 켜짐 스위치가 켜지면 AI 없이 넘어가야 한다
  await db.from("shop_consult_settings").update({ auto_reply_enabled: true, disclose_first_reply: false }).eq("shop_id", SHOP3);
  setConsultLicenseRequired(true);
});

test.afterAll(async () => {
  setConsultLicenseRequired(false);
  server?.close();
  await cleanup();
});

test.beforeEach(() => {
  hits = [];
});

test("사용권 없는 샵: 카카오 웹훅은 AI를 부르지 않고 상담 연결 + 사장님 문의", async ({ request }) => {
  const q = "[테스트] 사용권 없음 강습료 얼마예요?";
  const calls = await aiCalls();
  const r = await kakao(request, q);
  expect(r).toEqual({ text: KAKAO_ESCALATE, operator: true });
  await expect.poll(async () => (await outcome(q)).inquiries).toEqual([expect.objectContaining({ status: "open", type: "other", ai_draft: null })]);
  expect((await outcome(q)).replies).toEqual([expect.objectContaining({ role: "system", delivery_status: "sent" })]);
  expect(await aiCalls()).toBe(calls); // AI 호출 0
});

test("사용권 없는 샵: 인스타 웹훅은 AI 없이 '사장님께 전달했어요' 한 번 + 문의", async ({ request }) => {
  const q = "[테스트] 사용권 없음 인스타 가격?";
  const calls = await aiCalls();
  const user = await instagram(request, q);
  await expect.poll(() => hits.length, { timeout: 15_000 }).toBe(1);
  expect(hits[0].body.recipient?.id).toBe(user);
  expect(hits[0].body.message?.text).toBe(IG_ESCALATE);
  await expect.poll(async () => (await outcome(q)).inquiries).toEqual([expect.objectContaining({ status: "open", ai_draft: null })]);
  expect(await aiCalls()).toBe(calls);
});

test("설정 화면: 켜기 대신 사용권 안내, 인박스 띠, 인스타 새 연결 막힘, DB도 켜기 거부", async ({ page }) => {
  await admin().from("shop_consult_settings").update({ auto_reply_enabled: false }).eq("shop_id", SHOP3);
  await login(page, "team@winter.test");
  await page.goto("/shop/ai-consult/knowledge");
  const box = page.getByRole("group", { name: "AI 상담 사용권" });
  await expect(box).toContainText("AI 상담 사용권이 필요해요");
  await expect(box).toContainText("AI 상담은 별도 신청 서비스예요. 본사에 사용을 요청하시면 10일 무료 체험을 열어 드려요.");
  await expect(page.getByRole("button", { name: "AI 자동 응대 켜기" })).toHaveCount(0);
  await expect(page.getByText("사용권이 생기면 AI가 아래 안내 정보로 손님께 답합니다")).toBeVisible();
  // 안내 정보 편집은 그대로 (체험 전에 미리 채운다)
  await expect(page.getByRole("form", { name: "안내 정보: 강습료" }).getByRole("button", { name: "저장" })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const team = await userClient("team@winter.test");
  const { error } = await team.rpc("set_consult_settings", { p_shop_id: SHOP3, p_auto_reply: true, p_disclosure: null, p_disclose_first: null });
  expect(error?.code).toBe("42501");

  // 인스타 새 연결: 인스타 로그인으로 보내지 않고 안내
  await page.goto("/api/channels/instagram/connect");
  await expect(page).toHaveURL(/\/shop\/ai-consult\/knowledge\?ig=no_license$/);
  await expect(page.getByRole("region", { name: "인스타그램 연결" })).toContainText("AI 상담 사용권이 있어야 인스타그램을 연결할 수 있습니다");

  await page.goto("/shop/ai-consult/inbox");
  await expect(page.getByRole("status", { name: "AI 상담 사용권 안내" })).toHaveText(
    "AI 자동응답이 꺼져 있어요 — 모든 문의를 직접 답해 주세요. AI 상담을 쓰시려면 본사에 요청해 주세요.",
  );
  await expect(page.getByRole("list", { name: "상담 목록" }).getByRole("link")).toHaveCount(2); // 넘어온 문의는 그대로 보인다
});

test("본사가 체험을 주면: 켜기 → 첫 자동 답변 → 체험 시작(10일), 사용량 표시", async ({ page, request }) => {
  const adm = await asAdmin();
  const { error } = await adm.rpc("consult_admin_grant_license", { p_shop_id: SHOP3 });
  expect(error).toBeNull();
  await login(page, "team@winter.test");
  await page.goto("/shop/ai-consult/knowledge");
  const box = page.getByRole("group", { name: "AI 상담 사용권" });
  await expect(box).toContainText("무료 체험 대기 — 첫 자동 답변이 나간 때부터 10일");
  await page.getByRole("button", { name: "AI 자동 응대 켜기" }).click();
  await expect(page.getByRole("button", { name: "AI 자동 응대 끄기" })).toBeVisible();

  const calls = await aiCalls();
  const r = await kakao(request, "[테스트] 체험 강습료 얼마예요?");
  expect(r.text).toContain("120,000원");
  expect(r.operator).toBe(false);
  expect(await aiCalls()).toBe(calls + 1);
  await expect.poll(async () => (await admin().from("consult_licenses").select("starts_at, ends_at").eq("shop_id", SHOP3).single()).data?.starts_at).not.toBeNull();

  // 응답 건수(Q1) = 이번 한국 달 consult 성공 호출. 화면 숫자와 같은 정의로 센다
  const { data: rows } = await admin().from("ai_usage").select("feature, ok, created_at").eq("shop_id", SHOP3);
  const month = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7);
  const used = countResponses(rows ?? [], month);
  expect(used).toBe(1);
  await page.reload();
  await expect(box).toContainText(/무료 체험 중 — \d+월 \d+일까지 \(10일 남음\)/);
  await expect(box).toContainText(`이번 달 AI 응답 ${used} / 2,000건`);
  await page.goto("/shop/ai-consult/inbox");
  await expect(page.getByRole("status", { name: "AI 상담 사용권 안내" })).toHaveCount(0);
});

test("이번 달 포함 응답을 다 쓰면 AI 없이 사장님께 + 띠, 켜기는 그대로", async ({ page, request }) => {
  const adm = await asAdmin();
  expect((await adm.rpc("consult_admin_set_quota", { p_shop_id: SHOP3, p_included: 1, p_daily_cap: null })).error).toBeNull();
  const calls = await aiCalls();
  const q = "[테스트] 소진 강습료 얼마예요?";
  expect(await kakao(request, q)).toEqual({ text: KAKAO_ESCALATE, operator: true });
  expect(await aiCalls()).toBe(calls);
  await expect.poll(async () => (await outcome(q)).inquiries.length).toBe(1);

  await login(page, "team@winter.test");
  await page.goto("/shop/ai-consult/inbox");
  await expect(page.getByRole("status", { name: "AI 상담 사용권 안내" })).toContainText("이번 달 포함 AI 응답을 모두 썼어요");
  await page.goto("/shop/ai-consult/knowledge");
  await expect(page.getByRole("group", { name: "AI 상담 사용권" })).toContainText("이번 달 포함 응답을 다 썼어요");
  await expect(page.getByRole("button", { name: "AI 자동 응대 끄기" })).toBeVisible();
});

test("본사가 중지하면 자동응답이 꺼지고 켜기가 막힌다", async ({ page }) => {
  const adm = await asAdmin();
  expect((await adm.rpc("consult_admin_suspend", { p_shop_id: SHOP3, p_reason: "admin" })).error).toBeNull();
  const { data: s } = await admin().from("shop_consult_settings").select("auto_reply_enabled").eq("shop_id", SHOP3).single();
  expect(s?.auto_reply_enabled).toBe(false);
  await login(page, "team@winter.test");
  await page.goto("/shop/ai-consult/knowledge");
  await expect(page.getByRole("group", { name: "AI 상담 사용권" })).toContainText("AI 상담 사용이 중지됐어요");
  await expect(page.getByRole("button", { name: "AI 자동 응대 켜기" })).toHaveCount(0);
});
