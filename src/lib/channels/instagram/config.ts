// 인스타그램 DM 상담 설정 (P22-4). 환경변수가 하나라도 없으면 null → 기능 전체가 꺼진다
// (웹훅·연결 주소는 404, 화면은 "준비 중"). 값은 사장님이 Vercel 환경변수에 넣는다(docs/meta-setup.md).
// - META_APP_ID·META_APP_SECRET·META_VERIFY_TOKEN: 메타 앱 (필수)
// - CONSULT_ENCRYPTION_KEY·CONSULT_HASH_KEY: 토큰 암호화·손님 id 해시 (필수, P22-1)
// - META_GRAPH_API_VERSION: Graph API 버전 (기본 v24.0 — 확인 필요: 연결 시험 때 메타 앱 대시보드의 현재 버전으로)
// - META_HUMAN_AGENT=1: Human Agent 기능 심사를 통과한 뒤에만 켠다. 꺼져 있으면 24시간이 지난 대화는 사장님 승인으로도 보내지 않는다.
// - META_GRAPH_BASE: 시험(E2E 가짜 서버)용. 운영에는 넣지 않는다(기본 https://graph.instagram.com).
export type InstagramConfig = {
  appId: string;
  appSecret: string;
  verifyToken: string;
  apiVersion: string;
  graphBase: string; // Graph API (메시지 보내기·계정 정보·토큰 교환·갱신)
  oauthBase: string; // 인증 코드 → 짧은 토큰 (https://api.instagram.com)
  authorizeBase: string; // 사장님이 로그인하는 화면 (https://www.instagram.com)
  humanAgent: boolean;
};

type Env = Record<string, string | undefined>;

function validEncKey(k: string | undefined) {
  if (!k) return false;
  try {
    return Buffer.from(k, "base64").length === 32;
  } catch {
    return false;
  }
}

export function instagramConfig(env: Env = process.env): InstagramConfig | null {
  const appId = env.META_APP_ID?.trim();
  const appSecret = env.META_APP_SECRET?.trim();
  const verifyToken = env.META_VERIFY_TOKEN?.trim();
  if (!appId || !appSecret || !verifyToken) return null;
  if (!validEncKey(env.CONSULT_ENCRYPTION_KEY) || !env.CONSULT_HASH_KEY || env.CONSULT_HASH_KEY.length < 32) return null;
  const version = env.META_GRAPH_API_VERSION?.trim();
  return {
    appId,
    appSecret,
    verifyToken,
    apiVersion: version && /^v\d{1,3}\.\d$/.test(version) ? version : "v24.0",
    graphBase: (env.META_GRAPH_BASE?.trim() || "https://graph.instagram.com").replace(/\/+$/, ""),
    oauthBase: (env.META_OAUTH_BASE?.trim() || "https://api.instagram.com").replace(/\/+$/, ""),
    authorizeBase: "https://www.instagram.com",
    humanAgent: env.META_HUMAN_AGENT === "1",
  };
}
