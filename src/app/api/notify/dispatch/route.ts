import { NextResponse, type NextRequest } from "next/server";
import { dispatchPending } from "@/lib/notify/dispatch";

// 놓친 알림을 다시 보내는 주기 작업 (Vercel Cron). Authorization: Bearer CRON_SECRET
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  return NextResponse.json(await dispatchPending(200));
}
