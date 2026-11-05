import "server-only";
import { decryptSecret, encryptSecret } from "@/lib/ai/consult/crypto";
import { runConsult } from "@/lib/ai/consult/engine";
import { overLimit } from "@/lib/ops/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { consultStore } from "../store";
import { InstagramAdapter } from "./adapter";
import { instagramConfig } from "./config";
import { refreshExpiringTokens, type RefreshSummary } from "./tokens";
import type { InstagramChannelRow, InstagramWebhookDeps } from "./webhook";

// 인스타 웹훅의 실제 의존성: 서비스 키 클라이언트 + 상담 저장(../store.ts). 토큰은 보낼 때만 메모리에서 푼다.
export function instagramDeps(defer: InstagramWebhookDeps["defer"]): InstagramWebhookDeps {
  const db = createAdminClient();
  const store = consultStore(db);
  return {
    config: () => instagramConfig(),
    hashKey: () => {
      const k = process.env.CONSULT_HASH_KEY;
      return k && k.length >= 32 ? k : null;
    },
    async findChannelByAccount(accountId) {
      const { data, error } = await db
        .from("shop_channels")
        .select("id, shop_id, channel, external_id, enabled, credentials_enc")
        .eq("channel", "instagram")
        .eq("external_id", accountId)
        .maybeSingle();
      if (error) throw error;
      return (data as InstagramChannelRow | null) ?? null;
    },
    recordCustomerMessage: store.recordCustomerMessage,
    rateOk: async (name, subject) => (await overLimit([[name, subject]])) === null,
    runConsult: (input) => runConsult(input),
    replyContext: store.replyContext,
    recordReply: store.recordReply,
    hasOpenInquiry: store.hasOpenInquiry,
    openInquiry: store.openInquiry,
    markDisclosed: store.markDisclosed,
    saveReplyTarget: (conversationId, senderId) => store.saveReplyTarget(conversationId, encryptSecret(senderId)),
    sender(ch) {
      const cfg = instagramConfig();
      if (!cfg || !ch.credentials_enc || !ch.external_id) return null;
      try {
        return new InstagramAdapter({ config: cfg, accountId: ch.external_id, accessToken: decryptSecret(ch.credentials_enc) });
      } catch {
        return null;
      }
    },
    defer,
    now: () => Date.now(),
    log: (e) => console.info("instagram webhook", JSON.stringify(e)),
  };
}

// 매일 정리 작업에서 부른다. 기능이 꺼져 있으면 DB도 읽지 않는다.
export async function refreshInstagramTokens(): Promise<RefreshSummary> {
  if (!instagramConfig()) return { skipped: true, refreshed: 0, failed: 0, expired: 0 };
  const db = createAdminClient();
  return refreshExpiringTokens({
    config: () => instagramConfig(),
    async listExpiring(before) {
      const { data, error } = await db
        .from("shop_channels")
        .select("id, credentials_enc, token_expires_at")
        .eq("channel", "instagram")
        .eq("enabled", true)
        .not("credentials_enc", "is", null)
        .lt("token_expires_at", before);
      if (error) throw error;
      return data ?? [];
    },
    async save(id, credentialsEnc, expiresAt) {
      const { error } = await db
        .from("shop_channels")
        .update({ credentials_enc: credentialsEnc, token_expires_at: expiresAt.toISOString(), updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    encrypt: (p) => encryptSecret(p),
    decrypt: (e) => decryptSecret(e),
    fetchImpl: fetch,
    now: () => Date.now(),
    log: (e) => console.info("instagram token", JSON.stringify(e)),
  });
}
