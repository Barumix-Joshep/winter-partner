import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { connection, NextResponse } from "next/server";
import { requireArea } from "@/lib/auth/session";
import { instagramConfig } from "@/lib/channels/instagram/config";
import { authorizeUrl, CALLBACK_PATH, NONCE_COOKIE, signState, STATE_TTL_MS } from "@/lib/channels/instagram/oauth";
import { siteOrigin } from "@/lib/origin";
import { getMyShop } from "@/lib/shop/my-shop";

// 샵 관리자가 "인스타그램 연결하기"를 누르면 인스타 로그인 화면으로 보낸다 (P22-4).
// 환경변수가 없으면 404(기능 꺼짐). state에는 샵·사용자·nonce를 서명해 넣고, nonce는 httpOnly 쿠키로도 둔다(CSRF 방지).
export async function GET() {
  await connection();
  const cfg = instagramConfig();
  if (!cfg) return new NextResponse("not found", { status: 404 });
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/shop/new");
  const nonce = randomBytes(16).toString("hex");
  const state = signState({ s: shop.id, u: user.id, n: nonce, e: Date.now() + STATE_TTL_MS }, cfg.appSecret);
  const res = NextResponse.redirect(authorizeUrl(cfg, `${await siteOrigin()}${CALLBACK_PATH}`, state));
  res.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/channels/instagram",
    maxAge: STATE_TTL_MS / 1000,
  });
  return res;
}
