import { after } from "next/server";
import { kakaoDeps } from "@/lib/channels/kakao/deps";
import { kakaoRoute } from "@/lib/channels/kakao/webhook";

// 카카오 i 오픈빌더 스킬 서버 (P22-3). 주소의 token은 shop_channels.public_token(추측 불가).
// 어떤 경우에도 200 + 스킬 JSON. 3.5초를 넘기면 useCallback으로 답하고 after()에서 callbackUrl로 한 번 보낸다.
// after()는 응답 뒤에도 이 시간 안에서 돈다(카카오 콜백 주소 유효시간 약 1분).
export const maxDuration = 60;

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return kakaoRoute(req, token, kakaoDeps((task) => after(task)));
}
