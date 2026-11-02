import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordOpsEvent } from "@/lib/ops/record";

// 매일 도는 정리 작업 (Vercel Cron). Authorization: Bearer CRON_SECRET
// - 보관 기간(마지막 강습 후 3시즌)이 지난 손님 익명화
// - 보관 기간(2년)이 지난 접속 기록 정리
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  const [customers, logs] = await Promise.all([admin.rpc("purge_expired_customers"), admin.rpc("purge_access_logs")]);
  if (customers.error || logs.error) {
    console.error("daily maintenance failed", customers.error?.message, logs.error?.message);
    await recordOpsEvent("cron_run", "/api/maintenance/daily", `실패: ${customers.error?.message ?? ""} ${logs.error?.message ?? ""}`, false);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  const result = { ok: true, anonymizedCustomers: customers.data, purgedAccessLogs: logs.data };
  console.info("cron maintenance/daily", JSON.stringify(result));
  await recordOpsEvent("cron_run", "/api/maintenance/daily", JSON.stringify(result), true);
  return NextResponse.json(result);
}
