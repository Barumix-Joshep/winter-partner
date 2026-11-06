import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordOpsEvent } from "@/lib/ops/record";
import { refreshInstagramTokens } from "@/lib/channels/instagram/deps";

// 매일 도는 정리 작업 (Vercel Cron). Authorization: Bearer CRON_SECRET
// - 보관 기간(마지막 강습 후 3시즌)이 지난 손님 익명화
// - 보관 기간(2년)이 지난 접속 기록 정리
// - AI 상담 보존 기간(90일) 정리 (P22-6, purge_consult_data): 대화·메시지·피드백 삭제, 강습 등록으로 넘긴 문의만 연락처를 지우고 남김
// - AI 상담 사용권 정리 (P23-2, consult_license_sweep): 대기 14일이 지난 체험 시작, 켜짐 스위치가 켜져 있으면 끝난 사용권 중지·
//   만료 3일 전·이번 달 80%/100% 알림(앱 알림 목록에 쌓고 웹푸시는 09:00 notify/dispatch가 보낸다)
// - 인스타그램 장기 토큰 갱신 (만료 7일 전)
// 결과·운영 기록에는 건수만 남긴다(개인 정보 없음).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  const [customers, logs, consult, licenses] = await Promise.all([
    admin.rpc("purge_expired_customers"),
    admin.rpc("purge_access_logs"),
    admin.rpc("purge_consult_data"),
    admin.rpc("consult_license_sweep"),
  ]);
  if (customers.error || logs.error || consult.error || licenses.error) {
    const why = [customers.error?.message, logs.error?.message, consult.error?.message, licenses.error?.message].filter(Boolean).join(" ");
    console.error("daily maintenance failed", why);
    await recordOpsEvent("cron_run", "/api/maintenance/daily", `실패: ${why}`, false);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  // 인스타 장기 토큰 갱신(P22-4): 만료 7일 안의 토큰만. 메타 환경변수가 없으면 아무것도 하지 않는다. 실패해도 정리 작업은 성공으로 둔다.
  const instagram = await refreshInstagramTokens().catch(() => ({ skipped: false, refreshed: 0, failed: -1, expired: 0 }));
  const result = {
    ok: true,
    anonymizedCustomers: customers.data,
    purgedAccessLogs: logs.data,
    purgedConsult: consult.data,
    consultLicenses: licenses.data,
    instagramTokens: instagram,
  };
  console.info("cron maintenance/daily", JSON.stringify(result));
  await recordOpsEvent("cron_run", "/api/maintenance/daily", JSON.stringify(result), true);
  return NextResponse.json(result);
}
