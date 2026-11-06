// P22-6 보안·개인정보 마무리: 카카오·인스타 웹훅을 실제 의존성(kakaoDeps·instagramDeps·상담 엔진·AI 게이트·요청 제한)으로 돌리고
// DB(Supabase)·Graph만 가짜로 바꿔, 아래를 한 번에 확인한다.
// - 로그(console.*)·운영 기록(ops_events: recordOpsEvent, record_ops_event RPC)에 손님 글·전화·이메일·손님 원래 id가 없다
// - 손님 글 속 연락처는 문의(contact_enc)에 암호화로만, 메시지에는 가린 글만, AI에는 [전화]·[이메일]로
// - 대화 요청 제한(consult_conversation)·상담 하루 상한(300, ai_gate daily_cap)을 넘으면 AI 없이 escalate(상담 연결·문의)
// 실제 AI는 부르지 않는다(AI_MOCK=1 가짜 모델). 키·메타 값은 이 파일 안의 시험용 값이다(비밀 아님).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { limitKey } from "@/lib/ops/limits";
import { decryptSecret } from "@/lib/ai/consult/crypto";
import { igMessaging, igPayload, igSign, IG_ACCOUNT } from "./instagram/fixtures";
import { skillPayload } from "./kakao/fixtures";

// ---- 가짜 Supabase (서비스 키 클라이언트) ----------------------------------
const db = vi.hoisted(() => ({
  rpcs: [] as { name: string; args: Record<string, unknown> }[],
  writes: [] as { table: string; op: "update" | "insert"; payload: unknown }[],
  limited: new Set<string>(), // public_rate_limit에서 false를 돌려줄 키
  gate: { allowed: true, reason: "ok", model: "claude-haiku-5-5" },
  openInquiry: false,
  channel: null as Record<string, unknown> | null,
  license: null as string | null, // consult_license_check 결과(null = 함수 없음·스위치 꺼짐과 같게 null을 돌려준다)
}));

vi.mock("@/lib/supabase/admin", () => {
  const KB = [
    { id: "k1", kind: "price", title: "강습료", content: "[테스트] 1:1 2시간 120,000원" },
    { id: "k2", kind: "hours", title: "영업시간", content: "매일 오전 8시 ~ 오후 9시" },
  ];
  function table(name: string) {
    let op: "select" | "update" | "insert" = "select";
    let head = false;
    const result = () => {
      if (op !== "select") return { data: null, error: null };
      switch (name) {
        case "shop_channels":
          return { data: db.channel, error: null };
        case "shop_consult_settings":
          return { data: { auto_reply_enabled: true, confidence_threshold: 0.85, ai_disclosure_text: "AI 자동 답변이에요.", disclose_first_reply: true }, error: null };
        case "shops":
          return { data: { name: "[테스트] 하이원 렌탈" }, error: null };
        case "shop_knowledge":
          return { data: KB, error: null };
        case "conversations":
          return { data: { disclosed_at: "2026-11-01T00:00:00Z" }, error: null };
        case "inquiries":
          return head ? { data: null, count: db.openInquiry ? 1 : 0, error: null } : { data: null, error: null };
        default:
          return { data: null, error: null };
      }
    };
    const chain: Record<string, unknown> = {};
    for (const m of ["eq", "is", "in", "order", "limit", "not"]) chain[m] = () => chain;
    chain.select = (_cols?: string, opts?: { head?: boolean }) => ((head = !!opts?.head), chain);
    chain.update = (payload: unknown) => ((op = "update"), db.writes.push({ table: name, op, payload }), chain);
    chain.insert = (payload: unknown) => ((op = "insert"), db.writes.push({ table: name, op, payload }), chain);
    chain.maybeSingle = async () => result();
    chain.single = async () => result();
    chain.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, bad);
    return chain;
  }
  const client = {
    from: (name: string) => table(name),
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      db.rpcs.push({ name, args });
      switch (name) {
        case "public_rate_limit":
        case "public_rate_peek":
          return { data: !db.limited.has(String(args.p_key)), error: null };
        case "ai_gate":
          return { data: [db.gate], error: null };
        case "consult_license_check":
          return { data: db.license, error: null };
        case "consult_record_customer_message":
          return { data: [{ conversation_id: "c0000000-0000-0000-0000-000000000001", message_id: "m1", duplicate: false }], error: null };
        default:
          return { data: null, error: null };
      }
    },
  };
  return { createAdminClient: () => client };
});

// 운영 기록 쓰기 (ops_events) — 상담 경로에서는 쓰지 않아야 하고, 쓰더라도 손님 정보가 없어야 한다
const opsEvents = vi.hoisted(() => [] as unknown[][]);
vi.mock("@/lib/ops/record", () => ({ recordOpsEvent: vi.fn(async (...a: unknown[]) => void opsEvents.push(a)) }));

import { kakaoDeps } from "./kakao/deps";
import { kakaoRoute } from "./kakao/webhook";
import { busyResponse, escalateResponse } from "./kakao/format";
import { instagramDeps } from "./instagram/deps";
import { instagramRoute } from "./instagram/webhook";

// ---- 시험 값 ---------------------------------------------------------------
const TOKEN = "c".repeat(48);
const CONV = "c0000000-0000-0000-0000-000000000001";
const KAKAO_USER = "kakao-raw-user-id-7f3a9c";
const IG_USER = "9988776655443322";
const PHONE = "010-0000-4321";
const EMAIL = "privacy.test@example.com";
const META_SECRET = "unit-only-meta-secret";
const ENC_KEY = Buffer.alloc(32, 7).toString("base64");

const MESSAGES = [
  { label: "가격 질문 + 연락처", text: `[테스트] 강습료 얼마예요? 연락은 ${PHONE} 이나 ${EMAIL} 으로 주세요`, frag: "연락은" },
  { label: "예약 문의 + 연락처", text: `[테스트] 12월 20일 2명 예약 가능할까요? 김손님 ${PHONE.replace(/-/g, "")}`, frag: "김손님" },
  { label: "불만 + 이메일", text: `[테스트] 장비가 최악이에요 실망했어요 ${EMAIL}`, frag: "장비가 최악" },
];

const consoleCalls: unknown[][] = [];
let deferred: (() => Promise<void>)[] = [];
const defer = (t: () => Promise<void>) => void deferred.push(t);
const flush = async () => {
  for (const t of deferred.splice(0)) await t();
};
const graphHits: { url: string; body: string }[] = [];

beforeEach(() => {
  db.rpcs = [];
  db.writes = [];
  db.limited = new Set();
  db.gate = { allowed: true, reason: "ok", model: "claude-haiku-5-5" };
  db.openInquiry = false;
  db.license = null;
  opsEvents.length = 0;
  consoleCalls.length = 0;
  graphHits.length = 0;
  deferred = [];
  vi.stubEnv("AI_MOCK", "1");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("CONSULT_HASH_KEY", "unit-only-consult-hash-key-0123456789");
  vi.stubEnv("CONSULT_ENCRYPTION_KEY", ENC_KEY);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "unit-only");
  vi.stubEnv("META_APP_ID", "unit-app");
  vi.stubEnv("META_APP_SECRET", META_SECRET);
  vi.stubEnv("META_VERIFY_TOKEN", "unit-verify");
  vi.stubEnv("META_GRAPH_BASE", "https://graph.unit.example");
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, level).mockImplementation((...a: unknown[]) => void consoleCalls.push([level, ...a]));
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { body?: string }) => {
      graphHits.push({ url: String(url), body: String(init?.body ?? "") });
      return new Response(JSON.stringify({ recipient_id: "x", message_id: "out" }), { status: 200 });
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function kakaoChannel() {
  db.channel = { id: "ch-kakao", shop_id: "shop-1", channel: "kakao", external_id: "bot-0001", enabled: true };
}
function igChannel() {
  db.channel = { id: "ch-ig", shop_id: "shop-1", channel: "instagram", external_id: IG_ACCOUNT, enabled: true, credentials_enc: null };
}
// 토큰을 암호화해 둔 인스타 채널 (자동 답변을 실제로 보내는 경로)
async function igChannelWithToken() {
  const { encryptSecret } = await import("@/lib/ai/consult/crypto");
  db.channel = { id: "ch-ig", shop_id: "shop-1", channel: "instagram", external_id: IG_ACCOUNT, enabled: true, credentials_enc: encryptSecret("unit-ig-token") };
}

async function kakao(text: string) {
  const body = JSON.stringify(skillPayload({ utterance: text, userId: KAKAO_USER, callbackUrl: null }));
  const res = await kakaoRoute(new Request(`https://app.example/api/webhooks/kakao/${TOKEN}`, { method: "POST", body }), TOKEN, kakaoDeps(defer));
  const json = await res.json();
  await flush();
  return json;
}

async function instagram(text: string, mid = `mid-${Math.random().toString(36).slice(2)}`) {
  const raw = JSON.stringify(igPayload(igMessaging({ mid, text }, { sender: IG_USER, timestamp: Date.now() })));
  const res = await instagramRoute(
    new Request("https://app.example/api/webhooks/instagram", { method: "POST", headers: { "x-hub-signature-256": igSign(raw, META_SECRET) }, body: raw }),
    instagramDeps(defer),
  );
  expect(res.status).toBe(200);
  await flush();
}

// 로그·운영 기록 전체에 손님 정보가 없는지
function expectNoLeak(text: string, frag: string, rawUserId: string) {
  const logged = JSON.stringify(consoleCalls);
  const ops = JSON.stringify([opsEvents, db.rpcs.filter((r) => r.name === "record_ops_event")]);
  for (const out of [logged, ops]) {
    expect(out).not.toContain(text);
    expect(out).not.toContain(frag);
    expect(out).not.toContain("0000-4321");
    expect(out).not.toContain("01000004321");
    expect(out).not.toContain(EMAIL);
    expect(out).not.toContain(rawUserId);
  }
}

const rpc = (name: string) => db.rpcs.filter((r) => r.name === name);

describe("로그·운영 기록에 손님 글·연락처·원래 id가 없다", () => {
  it.each(MESSAGES)("카카오: $label", async ({ text, frag }) => {
    kakaoChannel();
    await kakao(text);
    expect(rpc("consult_record_customer_message")).toHaveLength(1); // 실제 흐름을 탔는지
    expect(consoleCalls.length).toBeGreaterThan(0); // 로그는 남긴다(길이·의도·결과)
    expectNoLeak(text, frag, KAKAO_USER);
  });

  it.each(MESSAGES)("인스타: $label", async ({ text, frag }) => {
    await igChannelWithToken();
    await instagram(text);
    expect(rpc("consult_record_customer_message")).toHaveLength(1);
    expect(consoleCalls.length).toBeGreaterThan(0);
    expectNoLeak(text, frag, IG_USER);
  });

  it("엔진이 실패해도(AI 오류) 오류 로그에 손님 글이 없다", async () => {
    kakaoChannel();
    vi.stubEnv("AI_MOCK", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "unit-not-a-key"); // 가짜 fetch가 Anthropic 주소에도 200 + 엉뚱한 본문 → 형식 오류
    const { text, frag } = MESSAGES[0];
    await kakao(text);
    expectNoLeak(text, frag, KAKAO_USER);
    expect(consoleCalls.some((c) => c[0] === "error" && String(c[1]).includes("ai call failed")) || rpc("record_ai_usage").some((r) => r.args.p_ok === false)).toBe(true); // 실패 경로를 탔는지
    expect(graphHits.every((h) => !h.url.includes("anthropic") || !h.body.includes(PHONE))).toBe(true); // AI에도 연락처를 보내지 않는다
  });

  it("DB 저장이 실패해도 기본 안내만 하고 로그에 손님 정보가 없다", async () => {
    db.channel = null; // 채널 없음
    const { text, frag } = MESSAGES[1];
    await kakao(text);
    await instagram(text);
    expect(rpc("consult_record_customer_message")).toHaveLength(0);
    expectNoLeak(text, frag, KAKAO_USER);
    expectNoLeak(text, frag, IG_USER);
  });
});

describe("연락처: 문의에는 암호화로만, 메시지·AI에는 가린 글만", () => {
  it.each([
    ["카카오", "kakao"],
    ["인스타", "instagram"],
  ])("%s", async (_l, ch) => {
    const text = MESSAGES[1].text; // 예약 문의 → escalate
    if (ch === "kakao") {
      kakaoChannel();
      await kakao(text);
    } else {
      igChannel();
      await instagram(text);
    }
    const saved = rpc("consult_record_customer_message")[0].args;
    expect(saved.p_text).not.toContain("01000004321");
    expect(saved.p_text).toContain("010-****-4321");
    expect(saved.p_user_hash).toMatch(/^[0-9a-f]{64}$/);
    const inq = rpc("consult_open_inquiry")[0].args;
    expect(String(inq.p_contact_enc)).toMatch(/^v1\./);
    expect(decryptSecret(String(inq.p_contact_enc), ENC_KEY)).toBe(PHONE);
    // 어떤 DB 쓰기에도 원문 연락처·원래 손님 id가 없다(인스타 손님 id는 reply_to_enc로 암호화)
    const all = JSON.stringify([db.rpcs, db.writes]);
    expect(all).not.toContain("01000004321");
    expect(all).not.toContain(PHONE);
    expect(all).not.toContain(KAKAO_USER);
    expect(all).not.toContain(IG_USER);
  });

  it("암호화 키가 없으면 연락처는 저장하지 않는다(문의는 열림, 가린 글은 메시지에)", async () => {
    kakaoChannel();
    vi.stubEnv("CONSULT_ENCRYPTION_KEY", "");
    await kakao(MESSAGES[1].text);
    expect(rpc("consult_open_inquiry")[0].args.p_contact_enc).toBeNull();
    expect(JSON.stringify(db.rpcs)).not.toContain("01000004321");
  });
});

describe("요청 제한·하루 상한 → AI 없이 escalate", () => {
  it("카카오 대화 제한(consult_conversation): 상담 연결 안내 + 문의, AI 게이트도 부르지 않는다", async () => {
    kakaoChannel();
    db.limited.add(limitKey("consult_conversation", CONV));
    expect(await kakao("[테스트] 강습료 얼마예요?")).toEqual(busyResponse());
    expect(rpc("ai_gate")).toHaveLength(0);
    expect(rpc("record_ai_usage")).toHaveLength(0);
    expect(rpc("consult_open_inquiry")).toHaveLength(1);
  });

  it("카카오 샵 제한(consult_shop): 저장·AI 없이 상담 연결 안내", async () => {
    kakaoChannel();
    db.limited.add(limitKey("consult_shop", "shop-1"));
    expect(await kakao("[테스트] 강습료 얼마예요?")).toEqual(busyResponse());
    expect(rpc("consult_record_customer_message")).toHaveLength(0);
    expect(rpc("ai_gate")).toHaveLength(0);
  });

  it("인스타 대화 제한: AI 없이 '사장님께 전달' 한 번 + 문의", async () => {
    await igChannelWithToken();
    db.limited.add(limitKey("consult_conversation", CONV));
    await instagram("[테스트] 강습료 얼마예요?");
    expect(rpc("ai_gate")).toHaveLength(0);
    expect(rpc("consult_open_inquiry")).toHaveLength(1);
    const sent = graphHits.filter((h) => h.url.includes("graph.unit.example"));
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toContain("사장님께 전달했어요");
  });

  it("인스타 샵 제한: 저장·AI·발송 없음", async () => {
    await igChannelWithToken();
    db.limited.add(limitKey("consult_shop", "shop-1"));
    await instagram("[테스트] 강습료 얼마예요?");
    expect(rpc("consult_record_customer_message")).toHaveLength(0);
    expect(rpc("ai_gate")).toHaveLength(0);
    expect(graphHits).toHaveLength(0);
  });

  it("카카오: 상담 하루 상한(300, daily_cap)이면 자동 답변 대신 상담 연결 + 문의, AI는 부르지 않는다", async () => {
    kakaoChannel();
    db.gate = { allowed: false, reason: "daily_cap", model: "claude-haiku-5-5" };
    expect(await kakao("[테스트] 강습료 얼마예요?")).toEqual(escalateResponse());
    expect(rpc("ai_gate")[0].args).toEqual({ p_shop_id: "shop-1", p_feature: "consult" });
    expect(rpc("record_ai_usage")).toHaveLength(0); // 모델 호출 없음
    expect(rpc("consult_open_inquiry")).toHaveLength(1);
  });

  it("인스타: 상담 하루 상한이면 자동 답변 없이 '사장님께 전달' + 문의", async () => {
    await igChannelWithToken();
    db.gate = { allowed: false, reason: "daily_cap", model: "claude-haiku-5-5" };
    await instagram("[테스트] 강습료 얼마예요?");
    expect(rpc("record_ai_usage")).toHaveLength(0);
    expect(rpc("consult_open_inquiry")).toHaveLength(1);
    const sent = graphHits.filter((h) => h.url.includes("graph.unit.example"));
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toContain("사장님께 전달했어요");
    expect(sent[0].body).not.toContain("120,000원");
  });

  it("상한 안이면 같은 질문에 자동 답변(대조군)", async () => {
    kakaoChannel();
    const res = await kakao("[테스트] 강습료 얼마예요?");
    expect(JSON.stringify(res)).toContain("120,000원");
    expect(rpc("record_ai_usage")).toHaveLength(1);
    expect(rpc("consult_open_inquiry")).toHaveLength(0);
  });
});

describe("AI 상담 사용권 (P23-2) → AI 없이 사장님께", () => {
  it.each(["no_license", "monthly_quota"])("카카오 %s: 상담 연결 + 문의(초안 없음), AI 게이트·모델 호출 0", async (state) => {
    kakaoChannel();
    db.license = state;
    expect(await kakao("[테스트] 강습료 얼마예요?")).toEqual(escalateResponse());
    expect(rpc("consult_license_check")[0].args).toEqual({ p_shop_id: "shop-1" });
    expect(rpc("ai_gate")).toHaveLength(0);
    expect(rpc("record_ai_usage")).toHaveLength(0);
    expect(rpc("consult_record_customer_message")).toHaveLength(1);
    expect(rpc("consult_open_inquiry")).toHaveLength(1);
    expect(rpc("consult_open_inquiry")[0].args.p_ai_draft).toBeNull();
  });

  it.each(["no_license", "monthly_quota"])("인스타 %s: AI 없이 '사장님께 전달' 한 번 + 문의", async (state) => {
    await igChannelWithToken();
    db.license = state;
    await instagram("[테스트] 강습료 얼마예요?");
    expect(rpc("ai_gate")).toHaveLength(0);
    expect(rpc("record_ai_usage")).toHaveLength(0);
    expect(rpc("consult_open_inquiry")).toHaveLength(1);
    const sent = graphHits.filter((h) => h.url.includes("graph.unit.example"));
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toContain("사장님께 전달했어요");
    expect(sent[0].body).not.toContain("120,000원");
  });

  it("사용권 확인이 ok면(스위치 꺼짐 포함) 지금처럼 자동 답변", async () => {
    kakaoChannel();
    db.license = "ok";
    expect(JSON.stringify(await kakao("[테스트] 강습료 얼마예요?"))).toContain("120,000원");
    expect(rpc("record_ai_usage")).toHaveLength(1);
  });
});
