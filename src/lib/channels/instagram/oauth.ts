// Instagram 로그인 OAuth (P22-4, 사장님 결정 1: 페이스북 페이지 없이 인스타 비즈니스 계정으로 로그인).
// 순서: 인스타 로그인 화면 → 콜백(code) → 짧은 토큰 → 장기 토큰(약 60일) → 계정 id 확인 → 웹훅 구독 → 암호화해 저장.
// 주소·응답 형식은 2026-11 기준 메타 문서를 따랐고, 오프라인이라 다시 확인하지 못했다(확인 필요 — 첫 연결 시험 때 docs/meta-setup.md 순서로 점검).
// HTTP는 주입(fetchImpl) — 시험은 가짜 fetch만 쓴다. 토큰·시크릿은 로그에 쓰지 않는다.
import { createHmac } from "node:crypto";
import { safeEqual, type FetchLike } from "./adapter";
import type { InstagramConfig } from "./config";

export const IG_SCOPES = ["instagram_business_basic", "instagram_business_manage_messages"] as const;
export const STATE_TTL_MS = 10 * 60 * 1000;
export const NONCE_COOKIE = "ig_oauth_nonce";
export const CALLBACK_PATH = "/api/channels/instagram/callback";

export type OAuthState = { s: string; u: string; n: string; e: number }; // 샵 id·사용자 id·nonce(쿠키와 대조)·만료(ms)

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const sign = (body: string, secret: string) => createHmac("sha256", secret).update(`ig-oauth:${body}`).digest("base64url");

export function signState(st: OAuthState, secret: string): string {
  const body = b64url(JSON.stringify(st));
  return `${body}.${sign(body, secret)}`;
}

// 서명·만료 확인. 틀리면 null
export function verifyState(state: string | null | undefined, secret: string, now: number): OAuthState | null {
  if (!state || state.length > 1000) return null;
  const [body, mac, extra] = state.split(".");
  if (!body || !mac || extra !== undefined || !safeEqual(mac, sign(body, secret))) return null;
  try {
    const st = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthState;
    if (typeof st.s !== "string" || typeof st.u !== "string" || typeof st.n !== "string" || typeof st.e !== "number") return null;
    return st.e > now ? st : null;
  } catch {
    return null;
  }
}

export function authorizeUrl(cfg: InstagramConfig, redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: cfg.appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: IG_SCOPES.join(","),
    state,
  });
  return `${cfg.authorizeBase}/oauth/authorize?${q}`;
}

export class InstagramApiError extends Error {
  constructor(
    readonly step: string,
    readonly status: number,
  ) {
    super(`instagram ${step} failed (${status})`);
    this.name = "InstagramApiError";
  }
}

async function call(step: string, fetchImpl: FetchLike, url: string, init: RequestInit = { method: "GET" }): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetchImpl(url, { ...init, signal: ctrl.signal });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !json) throw new InstagramApiError(step, res.status);
    return json;
  } catch (e) {
    if (e instanceof InstagramApiError) throw e;
    throw new InstagramApiError(step, 0);
  } finally {
    clearTimeout(timer);
  }
}

const tokenOf = (j: Record<string, unknown>, step: string) => {
  // 짧은 토큰 응답은 {access_token, user_id} 또는 {data: [{...}]} 형태가 문서마다 달라 둘 다 받는다(확인 필요)
  const row = Array.isArray(j.data) && j.data[0] && typeof j.data[0] === "object" ? (j.data[0] as Record<string, unknown>) : j;
  if (typeof row.access_token !== "string" || !row.access_token) throw new InstagramApiError(step, 200);
  return row.access_token;
};
const expiresAt = (j: Record<string, unknown>, now: number) => {
  const sec = typeof j.expires_in === "number" && j.expires_in > 0 ? j.expires_in : 60 * 24 * 60 * 60; // 없으면 60일로 본다(확인 필요)
  return new Date(now + sec * 1000);
};

// 인증 코드 → 짧은 토큰
export async function exchangeCode(cfg: InstagramConfig, code: string, redirectUri: string, fetchImpl: FetchLike = fetch): Promise<string> {
  const form = new URLSearchParams({ client_id: cfg.appId, client_secret: cfg.appSecret, grant_type: "authorization_code", redirect_uri: redirectUri, code });
  const j = await call("code", fetchImpl, `${cfg.oauthBase}/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  return tokenOf(j, "code");
}

// 짧은 토큰 → 장기 토큰
export async function longLivedToken(cfg: InstagramConfig, shortToken: string, now: number, fetchImpl: FetchLike = fetch) {
  const q = new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: cfg.appSecret, access_token: shortToken });
  const j = await call("long_lived", fetchImpl, `${cfg.graphBase}/access_token?${q}`);
  return { token: tokenOf(j, "long_lived"), expiresAt: expiresAt(j, now) };
}

// 장기 토큰 갱신 (발급 24시간 뒤부터, 만료 전에만 된다 — 확인 필요)
export async function refreshToken(cfg: InstagramConfig, token: string, now: number, fetchImpl: FetchLike = fetch) {
  const q = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token });
  const j = await call("refresh", fetchImpl, `${cfg.graphBase}/refresh_access_token?${q}`);
  return { token: tokenOf(j, "refresh"), expiresAt: expiresAt(j, now) };
}

// 연결한 계정의 id(웹훅 recipient.id와 같은 값 — 확인 필요)·사용자 이름
export async function fetchAccount(cfg: InstagramConfig, token: string, fetchImpl: FetchLike = fetch) {
  const j = await call("me", fetchImpl, `${cfg.graphBase}/${cfg.apiVersion}/me?fields=user_id,username`, {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
  });
  const accountId = typeof j.user_id === "string" || typeof j.user_id === "number" ? String(j.user_id) : null;
  if (!accountId || !/^[0-9]{1,40}$/.test(accountId)) throw new InstagramApiError("me", 200);
  return { accountId, username: typeof j.username === "string" ? j.username.slice(0, 60) : null };
}

// 이 계정의 DM 웹훅을 우리 앱으로 받기
export async function subscribeMessages(cfg: InstagramConfig, token: string, fetchImpl: FetchLike = fetch) {
  const j = await call("subscribe", fetchImpl, `${cfg.graphBase}/${cfg.apiVersion}/me/subscribed_apps?subscribed_fields=messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  if (j.success !== true) throw new InstagramApiError("subscribe", 200);
}

// 콜백 한 번에 필요한 일 전부 (저장은 부르는 쪽이 암호화해서)
export async function completeInstagramLogin(cfg: InstagramConfig, code: string, redirectUri: string, now: number, fetchImpl: FetchLike = fetch) {
  const short = await exchangeCode(cfg, code, redirectUri, fetchImpl);
  const long = await longLivedToken(cfg, short, now, fetchImpl);
  const account = await fetchAccount(cfg, long.token, fetchImpl);
  await subscribeMessages(cfg, long.token, fetchImpl);
  return { ...account, token: long.token, expiresAt: long.expiresAt };
}
