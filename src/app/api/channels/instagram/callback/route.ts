import { connection, NextResponse, type NextRequest } from "next/server";
import { encryptSecret } from "@/lib/ai/consult/crypto";
import { requireArea } from "@/lib/auth/session";
import { instagramConfig } from "@/lib/channels/instagram/config";
import { handleInstagramCallback, KNOWLEDGE_PATH } from "@/lib/channels/instagram/connect";
import { CALLBACK_PATH, completeInstagramLogin, NONCE_COOKIE } from "@/lib/channels/instagram/oauth";
import { siteOrigin } from "@/lib/origin";
import { getMyShop } from "@/lib/shop/my-shop";
import { createAdminClient } from "@/lib/supabase/admin";

// 인스타 로그인 뒤 돌아오는 주소 (P22-4). 메타 앱에 "유효한 OAuth 리디렉션 URI"로 등록한다(docs/meta-setup.md).
// 토큰은 암호화해 서버 전용 RPC(consult_connect_instagram)로 저장하고, 안내 정보 화면으로 돌려보낸다(?ig=결과).
export async function GET(req: NextRequest) {
  await connection();
  const cfg = instagramConfig();
  if (!cfg) return new NextResponse("not found", { status: 404 });
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  const origin = await siteOrigin();
  const redirectUri = `${origin}${CALLBACK_PATH}`;
  const outcome = await handleInstagramCallback(req.nextUrl.searchParams, {
    config: cfg,
    userId: user.id,
    shopId: shop?.id ?? null,
    nonceCookie: req.cookies.get(NONCE_COOKIE)?.value ?? null,
    redirectUri,
    now: () => Date.now(),
    completeLogin: (code) => completeInstagramLogin(cfg, code, redirectUri, Date.now()),
    encrypt: (p) => encryptSecret(p),
    async save(r) {
      const { error } = await createAdminClient().rpc("consult_connect_instagram", {
        p_shop_id: r.shopId,
        p_actor: r.userId,
        p_external_id: r.accountId,
        p_credentials_enc: r.credentialsEnc,
        p_token_expires_at: r.expiresAt.toISOString(),
      });
      if (error?.code === "23505") return "taken";
      if (error) throw error;
      return "ok";
    },
    log: (e) => console.info("instagram connect", JSON.stringify(e)),
  });
  const res = NextResponse.redirect(`${origin}${KNOWLEDGE_PATH}?ig=${outcome}`);
  res.cookies.delete({ name: NONCE_COOKIE, path: "/api/channels/instagram" });
  return res;
}
