import { NextResponse, type NextRequest } from "next/server";
import { dispatchPending } from "@/lib/notify/dispatch";
import { recordOpsEvent } from "@/lib/ops/record";

// 놓친 알림을 다시 보내는 주기 작업 (Vercel Cron). Authorization: Bearer CRON_SECRET
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const result = await dispatchPending(200);
  // 성공해도 실행 기록을 남긴다 (본사 화면의 "크론 마지막 실행")
  console.info("cron notify/dispatch", JSON.stringify(result));
  await recordOpsEvent("cron_run", "/api/notify/dispatch", JSON.stringify(result), true);
  return NextResponse.json(result);
}
