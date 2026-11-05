import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordOpsEvent } from "@/lib/ops/record";
import { refreshInstagramTokens } from "@/lib/channels/instagram/deps";

// 매일 도는 정리 작업 (Vercel Cron). Authorization: Bearer CRON_SECRET
// - 보관 기간(마지막 강습 후 3시즌)이 지난 손님 익명화
// - 보관 기간(2년)이 지난 접속 기록 정리
// - 인스타그램 장기 토큰 갱신 (만료 7일 전)
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
  // 인스타 장기 토큰 갱신(P22-4): 만료 7일 안의 토큰만. 메타 환경변수가 없으면 아무것도 하지 않는다. 실패해도 정리 작업은 성공으로 둔다.
  const instagram = await refreshInstagramTokens().catch(() => ({ skipped: false, refreshed: 0, failed: -1, expired: 0 }));
  const result = { ok: true, anonymizedCustomers: customers.data, purgedAccessLogs: logs.data, instagramTokens: instagram };
  console.info("cron maintenance/daily", JSON.stringify(result));
  await recordOpsEvent("cron_run", "/api/maintenance/daily", JSON.stringify(result), true);
  return NextResponse.json(result);
}
