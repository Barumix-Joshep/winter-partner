import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { connection, NextResponse } from "next/server";
import { requireArea } from "@/lib/auth/session";
import { instagramConfig } from "@/lib/channels/instagram/config";
import { KNOWLEDGE_PATH } from "@/lib/channels/instagram/connect";
import { authorizeUrl, CALLBACK_PATH, NONCE_COOKIE, signState, STATE_TTL_MS } from "@/lib/channels/instagram/oauth";
import { licenseView } from "@/lib/ai/consult/license";
import { myConsultLicense } from "@/lib/ai/consult/license-server";
import { requestOrigin } from "@/lib/origin";
import { getMyShop } from "@/lib/shop/my-shop";

// 샵 관리자가 "인스타그램 연결하기"를 누르면 인스타 로그인 화면으로 보낸다 (P22-4).
// 환경변수가 없으면 404(기능 꺼짐). state에는 샵·사용자·nonce를 서명해 넣고, nonce는 httpOnly 쿠키로도 둔다(CSRF 방지).
// AI 상담 사용권이 없으면(켜짐 스위치가 켜져 있을 때, P23-2 Q16) 인스타 로그인으로 보내지 않고 안내 화면으로. 연결 RPC도 DB에서 다시 막는다.
export async function GET() {
  await connection();
  const cfg = instagramConfig();
  if (!cfg) return new NextResponse("not found", { status: 404 });
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/shop/new");
  const license = await myConsultLicense(shop.id);
  if (license && !licenseView(license, Date.now()).canTurnOn) redirect(`${KNOWLEDGE_PATH}?ig=no_license`);
  const nonce = randomBytes(16).toString("hex");
  const state = signState({ s: shop.id, u: user.id, n: nonce, e: Date.now() + STATE_TTL_MS }, cfg.appSecret);
  const res = NextResponse.redirect(authorizeUrl(cfg, `${await requestOrigin()}${CALLBACK_PATH}`, state));
  res.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/channels/instagram",
    maxAge: STATE_TTL_MS / 1000,
  });
  return res;
}
