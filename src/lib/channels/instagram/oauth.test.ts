// P22-4 인스타 로그인 연결·토큰 갱신: 설정 없으면 꺼짐, state 서명·만료·nonce, 콜백 판단, 토큰 교환 순서(가짜 fetch), 만료 7일 전 갱신.
import { describe, expect, it, vi } from "vitest";
import { instagramConfig, type InstagramConfig } from "./config";
import { handleInstagramCallback, type CallbackDeps } from "./connect";
import { authorizeUrl, completeInstagramLogin, signState, verifyState } from "./oauth";
import { refreshExpiringTokens, type RefreshDeps } from "./tokens";

const ENV = {
  META_APP_ID: "app-1",
  META_APP_SECRET: "test-app-secret",
  META_VERIFY_TOKEN: "verify-me",
  CONSULT_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  CONSULT_HASH_KEY: "test-consult-hash-key-0123456789abcdef",
};
const CFG = instagramConfig({ ...ENV, META_GRAPH_BASE: "https://graph.example", META_OAUTH_BASE: "https://api.example" }) as InstagramConfig;
const NOW = Date.UTC(2026, 11, 1, 0, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

describe("설정", () => {
  it("META_*·CONSULT_* 가 하나라도 없으면 null(기능 꺼짐)", () => {
    expect(instagramConfig({})).toBeNull();
    for (const k of Object.keys(ENV)) expect(instagramConfig({ ...ENV, [k]: "" })).toBeNull();
    expect(instagramConfig({ ...ENV, CONSULT_ENCRYPTION_KEY: "short" })).toBeNull();
  });
  it("기본값: graph.instagram.com, Human Agent 꺼짐", () => {
    const c = instagramConfig(ENV)!;
    expect(c.graphBase).toBe("https://graph.instagram.com");
    expect(c.humanAgent).toBe(false);
    expect(instagramConfig({ ...ENV, META_HUMAN_AGENT: "1" })!.humanAgent).toBe(true);
  });
});

describe("state", () => {
  const st = { s: "shop-1", u: "user-1", n: "nonce-1", e: NOW + 600_000 };
  it("서명한 state는 그대로 풀린다", () => {
    expect(verifyState(signState(st, "k"), "k", NOW)).toEqual(st);
  });
  it("다른 키·고친 본문·만료는 null", () => {
    const s = signState(st, "k");
    expect(verifyState(s, "other", NOW)).toBeNull();
    expect(verifyState(signState({ ...st, s: "shop-2" }, "x").split(".")[0] + "." + s.split(".")[1], "k", NOW)).toBeNull();
    expect(verifyState(s, "k", NOW + 600_001)).toBeNull();
    expect(verifyState(null, "k", NOW)).toBeNull();
  });
  it("인스타 로그인 주소에 두 권한과 state", () => {
    const u = new URL(authorizeUrl(CFG, "https://app.example/cb", "S"));
    expect(u.origin + u.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(u.searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_manage_messages");
    expect(u.searchParams.get("state")).toBe("S");
    expect(u.searchParams.get("client_id")).toBe("app-1");
  });
});

// 가짜 메타 서버 (주소별 응답)
function fakeMeta(over: Record<string, { status?: number; body: unknown }> = {}) {
  const routes: Record<string, { status?: number; body: unknown }> = {
    "https://api.example/oauth/access_token": { body: { access_token: "short-1", user_id: 111 } },
    "https://graph.example/access_token": { body: { access_token: "long-1", token_type: "bearer", expires_in: 5_184_000 } },
    "https://graph.example/v24.0/me": { body: { user_id: "17841400000000099", username: "test_shop" } },
    "https://graph.example/v24.0/me/subscribed_apps": { body: { success: true } },
    "https://graph.example/refresh_access_token": { body: { access_token: "long-2", token_type: "bearer", expires_in: 5_184_000 } },
    ...over,
  };
  return vi.fn(async (url: string, init: RequestInit) => {
    void init;
    const r = routes[url.split("?")[0]];
    if (!r) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  });
}

describe("토큰 교환 (가짜 fetch)", () => {
  it("코드 → 짧은 토큰 → 장기 토큰 → 계정 id → 웹훅 구독", async () => {
    const f = fakeMeta();
    const r = await completeInstagramLogin(CFG, "code-1", "https://app.example/cb", NOW, f);
    expect(r).toEqual({ accountId: "17841400000000099", username: "test_shop", token: "long-1", expiresAt: new Date(NOW + 5_184_000_000) });
    expect(f.mock.calls.map((c) => c[0].split("?")[0])).toEqual([
      "https://api.example/oauth/access_token",
      "https://graph.example/access_token",
      "https://graph.example/v24.0/me",
      "https://graph.example/v24.0/me/subscribed_apps",
    ]);
    expect(String(f.mock.calls[0][1].body)).toContain("grant_type=authorization_code");
    expect(f.mock.calls[1][0]).toContain("grant_type=ig_exchange_token");
  });
  it("중간 실패는 단계 이름과 함께 실패", async () => {
    await expect(completeInstagramLogin(CFG, "c", "u", NOW, fakeMeta({ "https://graph.example/v24.0/me/subscribed_apps": { status: 400, body: { error: {} } } }))).rejects.toMatchObject({
      step: "subscribe",
      status: 400,
    });
  });
});

describe("콜백 판단", () => {
  const state = (o: Partial<{ s: string; u: string; n: string; e: number }> = {}) => signState({ s: "shop-1", u: "user-1", n: "nonce-1", e: NOW + 600_000, ...o }, CFG.appSecret);
  function deps(over: Partial<CallbackDeps> = {}): CallbackDeps {
    return {
      config: CFG,
      userId: "user-1",
      shopId: "shop-1",
      nonceCookie: "nonce-1",
      redirectUri: "https://app.example/cb",
      now: () => NOW,
      completeLogin: vi.fn(async () => ({ accountId: "17841400000000099", token: "long-1", expiresAt: new Date(NOW + 60 * DAY) })),
      encrypt: (p) => `v1.${Buffer.from(p).toString("base64")}`,
      save: vi.fn(async () => "ok" as const),
      log: () => {},
      ...over,
    };
  }
  const q = (o: Record<string, string>) => new URLSearchParams(o);

  it("정상: 암호화한 토큰을 저장하고 connected", async () => {
    const d = deps();
    expect(await handleInstagramCallback(q({ code: "c1", state: state() }), d)).toBe("connected");
    expect(d.save).toHaveBeenCalledWith({ shopId: "shop-1", userId: "user-1", accountId: "17841400000000099", credentialsEnc: `v1.${Buffer.from("long-1").toString("base64")}`, expiresAt: new Date(NOW + 60 * DAY) });
  });
  it("사장님이 거절하면 denied, 저장 없음", async () => {
    const d = deps();
    expect(await handleInstagramCallback(q({ error: "access_denied", state: state() }), d)).toBe("denied");
    expect(d.completeLogin).not.toHaveBeenCalled();
  });
  it("state 위조·만료·nonce 쿠키 불일치는 expired", async () => {
    expect(await handleInstagramCallback(q({ code: "c", state: "x.y" }), deps())).toBe("expired");
    expect(await handleInstagramCallback(q({ code: "c", state: state({ e: NOW - 1 }) }), deps())).toBe("expired");
    expect(await handleInstagramCallback(q({ code: "c", state: state() }), deps({ nonceCookie: "other" }))).toBe("expired");
    expect(await handleInstagramCallback(q({ code: "c", state: state() }), deps({ nonceCookie: null }))).toBe("expired");
  });
  it("다른 사람·다른 샵으로 시작한 state는 error, 저장 없음", async () => {
    const d = deps({ userId: "user-2" });
    expect(await handleInstagramCallback(q({ code: "c", state: state() }), d)).toBe("error");
    expect(await handleInstagramCallback(q({ code: "c", state: state() }), deps({ shopId: "shop-2" }))).toBe("error");
    expect(d.completeLogin).not.toHaveBeenCalled();
  });
  it("이미 다른 샵에 연결된 계정은 taken", async () => {
    expect(await handleInstagramCallback(q({ code: "c", state: state() }), deps({ save: async () => "taken" }))).toBe("taken");
  });
  it("메타 오류는 error (토큰·코드는 로그에 없다)", async () => {
    const logs: Record<string, unknown>[] = [];
    const d = deps({ completeLogin: async () => Promise.reject(new Error("x")), log: (e) => logs.push(e) });
    expect(await handleInstagramCallback(q({ code: "secret-code", state: state() }), d)).toBe("error");
    expect(JSON.stringify(logs)).not.toContain("secret-code");
  });
});

describe("토큰 갱신 (매일 정리 작업)", () => {
  function deps(rows: { id: string; credentials_enc: string | null; token_expires_at: string | null }[], over: Partial<RefreshDeps> = {}) {
    const saved: unknown[] = [];
    const d: RefreshDeps = {
      config: () => CFG,
      listExpiring: vi.fn(async () => rows),
      save: vi.fn(async (id, enc, exp) => {
        saved.push({ id, enc, exp });
      }),
      encrypt: (p) => `enc(${p})`,
      decrypt: (e) => e.replace(/^enc\(|\)$/g, ""),
      fetchImpl: fakeMeta(),
      now: () => NOW,
      log: () => {},
      ...over,
    };
    return { d, saved };
  }
  it("환경변수가 없으면 아무것도 하지 않는다", async () => {
    const { d } = deps([], { config: () => null });
    expect(await refreshExpiringTokens(d)).toEqual({ skipped: true, refreshed: 0, failed: 0, expired: 0 });
    expect(d.listExpiring).not.toHaveBeenCalled();
  });
  it("만료 7일 안의 토큰만 고르고(조회 기준), 갱신한 토큰을 암호화해 새 만료일과 저장", async () => {
    const { d, saved } = deps([{ id: "ch-1", credentials_enc: "enc(long-1)", token_expires_at: new Date(NOW + 3 * DAY).toISOString() }]);
    expect(await refreshExpiringTokens(d)).toEqual({ skipped: false, refreshed: 1, failed: 0, expired: 0 });
    expect(d.listExpiring).toHaveBeenCalledWith(new Date(NOW + 7 * DAY).toISOString());
    expect(saved).toEqual([{ id: "ch-1", enc: "enc(long-2)", exp: new Date(NOW + 5_184_000_000) }]);
    expect(String(vi.mocked(d.fetchImpl).mock.calls[0][0])).toContain("grant_type=ig_refresh_token&access_token=long-1");
  });
  it("이미 만료된 토큰은 갱신하지 않고 expired로 센다", async () => {
    const { d, saved } = deps([{ id: "ch-1", credentials_enc: "enc(t)", token_expires_at: new Date(NOW - 1).toISOString() }]);
    expect(await refreshExpiringTokens(d)).toMatchObject({ refreshed: 0, expired: 1 });
    expect(saved).toHaveLength(0);
  });
  it("메타 오류는 failed로 세고 다음 토큰을 계속", async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => (n++ === 0 ? new Response("{}", { status: 400 }) : new Response(JSON.stringify({ access_token: "ok", expires_in: 100 }))));
    const { d } = deps(
      [
        { id: "a", credentials_enc: "enc(1)", token_expires_at: new Date(NOW + DAY).toISOString() },
        { id: "b", credentials_enc: "enc(2)", token_expires_at: new Date(NOW + DAY).toISOString() },
      ],
      { fetchImpl },
    );
    expect(await refreshExpiringTokens(d)).toMatchObject({ refreshed: 1, failed: 1 });
  });
});
