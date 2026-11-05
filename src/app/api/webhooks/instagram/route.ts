import { after, connection, type NextRequest } from "next/server";
import { instagramConfig } from "@/lib/channels/instagram/config";
import { instagramDeps } from "@/lib/channels/instagram/deps";
import { instagramRoute, instagramVerify } from "@/lib/channels/instagram/webhook";

// 인스타그램 DM 웹훅 (P22-4). 메타 앱 대시보드에 이 주소와 META_VERIFY_TOKEN을 등록한다(docs/meta-setup.md).
// 환경변수가 없으면 GET·POST 모두 404(기능 꺼짐). POST는 서명을 확인한 뒤 200을 먼저 돌려주고 처리는 after()에서.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  await connection(); // 빌드 때 미리 만들지 않는다(환경변수를 요청 때 읽게)
  return instagramVerify(req.nextUrl, instagramConfig());
}

export async function POST(req: Request) {
  return instagramRoute(req, instagramDeps((task) => after(task)));
}
