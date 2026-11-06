import "server-only";
import { runConsult } from "@/lib/ai/consult/engine";
import { overLimit } from "@/lib/ops/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { consultStore } from "../store";
import { postKakaoCallback } from "./adapter";
import { KAKAO_BUDGET_MS, type KakaoChannelRow, type KakaoWebhookDeps } from "./webhook";

// 카카오 웹훅의 실제 의존성: 서비스 키 클라이언트 + 상담 저장(../store.ts, security definer RPC).
// 손님 상담 표(conversations·inquiries)는 로그인 사용자가 쓰지 못하고, 서버(service_role)만 쓴다.
export function kakaoDeps(defer: KakaoWebhookDeps["defer"]): KakaoWebhookDeps {
  const db = createAdminClient();
  const store = consultStore(db);
  return {
    hashKey: () => {
      const k = process.env.CONSULT_HASH_KEY;
      return k && k.length >= 32 ? k : null;
    },
    async findChannel(token) {
      const { data, error } = await db.from("shop_channels").select("id, shop_id, channel, external_id, enabled").eq("public_token", token).maybeSingle();
      if (error) throw error;
      return (data as KakaoChannelRow | null) ?? null;
    },
    recordCustomerMessage: store.recordCustomerMessage,
    rateOk: async (name, subject) => (await overLimit([[name, subject]])) === null,
    licenseState: store.licenseState,
    runConsult: (input) => runConsult(input),
    replyContext: store.replyContext,
    recordReply: store.recordReply,
    openInquiry: store.openInquiry,
    markDisclosed: store.markDisclosed,
    postCallback: (url, body) => postKakaoCallback(url, body),
    defer,
    now: () => Date.now(),
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    budgetMs: KAKAO_BUDGET_MS,
    log: (e) => console.info("kakao webhook", JSON.stringify(e)),
  };
}
