// 인스타 연결 콜백 판단 (P22-4). 라우트(src/app/api/channels/instagram/callback)가 세션·쿠키·DB를 주입한다.
// 확인 순서: 기능 켜짐 → 손님이 거절했는지 → state 서명·만료 → 쿠키 nonce → 로그인한 사람·샵이 state와 같은지 → 메타 토큰 교환 → 암호화 저장.
// 결과는 안내 화면으로 돌려보낼 상태 값(ig=…)만. 토큰·코드는 로그에 쓰지 않는다.
import type { InstagramConfig } from "./config";
import { InstagramApiError, verifyState } from "./oauth";

export type ConnectOutcome = "connected" | "denied" | "expired" | "taken" | "error";
export const KNOWLEDGE_PATH = "/shop/ai-consult/knowledge";

export type CallbackDeps = {
  config: InstagramConfig;
  userId: string;
  shopId: string | null;
  nonceCookie: string | null;
  redirectUri: string;
  now: () => number;
  completeLogin: (code: string) => Promise<{ accountId: string; token: string; expiresAt: Date }>;
  encrypt: (plain: string) => string;
  // consult_connect_instagram (서버 전용 RPC). 다른 샵에 이미 연결된 계정이면 "taken"
  save: (r: { shopId: string; userId: string; accountId: string; credentialsEnc: string; expiresAt: Date }) => Promise<"ok" | "taken">;
  log: (e: Record<string, unknown>) => void;
};

export async function handleInstagramCallback(params: URLSearchParams, deps: CallbackDeps): Promise<ConnectOutcome> {
  if (params.get("error")) return "denied";
  const st = verifyState(params.get("state"), deps.config.appSecret, deps.now());
  if (!st) return "expired";
  if (!deps.nonceCookie || deps.nonceCookie !== st.n) return "expired";
  if (st.u !== deps.userId || !deps.shopId || st.s !== deps.shopId) return "error";
  const code = params.get("code");
  if (!code || code.length > 2000) return "error";
  try {
    const r = await deps.completeLogin(code);
    const saved = await deps.save({ shopId: deps.shopId, userId: deps.userId, accountId: r.accountId, credentialsEnc: deps.encrypt(r.token), expiresAt: r.expiresAt });
    deps.log({ channel: "instagram", outcome: saved === "ok" ? "connected" : "taken" });
    return saved === "ok" ? "connected" : "taken";
  } catch (e) {
    deps.log({ channel: "instagram", outcome: "connect_failed", step: e instanceof InstagramApiError ? e.step : "save", status: e instanceof InstagramApiError ? e.status : 0 });
    return "error";
  }
}
