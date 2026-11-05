// 인스타 장기 토큰 갱신 (P22-4). 매일 정리 작업(api/maintenance/daily)이 부른다.
// 만료 7일 안에 드는 토큰만 갱신한다. 이미 만료된 토큰은 갱신할 수 없어 "다시 연결 필요"로 남긴다(화면에 표시).
// 환경변수가 없으면(기능 꺼짐) 아무것도 하지 않는다. HTTP·DB·암호화·시각은 주입 — 시험은 가짜 fetch만.
import type { FetchLike } from "./adapter";
import type { InstagramConfig } from "./config";
import { refreshToken } from "./oauth";

export const REFRESH_BEFORE_MS = 7 * 24 * 60 * 60 * 1000;

export type ExpiringRow = { id: string; credentials_enc: string | null; token_expires_at: string | null };
export type RefreshDeps = {
  config: () => InstagramConfig | null;
  listExpiring: (beforeIso: string) => Promise<ExpiringRow[]>;
  save: (id: string, credentialsEnc: string, expiresAt: Date) => Promise<void>;
  encrypt: (plain: string) => string;
  decrypt: (enc: string) => string;
  fetchImpl: FetchLike;
  now: () => number;
  log: (e: Record<string, unknown>) => void;
};
export type RefreshSummary = { skipped: boolean; refreshed: number; failed: number; expired: number };

export async function refreshExpiringTokens(deps: RefreshDeps): Promise<RefreshSummary> {
  const sum: RefreshSummary = { skipped: false, refreshed: 0, failed: 0, expired: 0 };
  const cfg = deps.config();
  if (!cfg) return { ...sum, skipped: true };
  const now = deps.now();
  const rows = await deps.listExpiring(new Date(now + REFRESH_BEFORE_MS).toISOString());
  for (const row of rows) {
    const exp = row.token_expires_at ? Date.parse(row.token_expires_at) : NaN;
    if (!row.credentials_enc || !Number.isFinite(exp)) continue;
    if (exp <= now) {
      sum.expired++;
      continue;
    }
    try {
      const r = await refreshToken(cfg, deps.decrypt(row.credentials_enc), now, deps.fetchImpl);
      await deps.save(row.id, deps.encrypt(r.token), r.expiresAt);
      sum.refreshed++;
    } catch (e) {
      sum.failed++;
      deps.log({ channel: "instagram", outcome: "refresh_failed", error: (e as Error)?.name ?? "error" });
    }
  }
  return sum;
}
