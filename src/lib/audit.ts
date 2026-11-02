import "server-only";
import { createClient } from "@/lib/supabase/server";

export type AccessAction = "customer_view" | "customer_export" | "settlement_export" | "settlement_pdf";

export const ACCESS_LABEL: Record<AccessAction, string> = {
  customer_view: "손님 연락처 열람",
  customer_export: "손님 목록 다운로드",
  settlement_export: "정산 엑셀 다운로드",
  settlement_pdf: "정산서 PDF 열람",
};

// 접속 기록 (DB가 권한을 다시 확인한다). 기록 실패는 화면을 막지 않되 서버 로그에 남긴다.
export async function logAccess(action: AccessAction, shopId: string, targetId: string | null, detail: Record<string, unknown> = {}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("log_access", { p_action: action, p_shop_id: shopId, p_target_id: targetId, p_detail: detail });
  if (error) console.error("access log failed", action, error.message);
}
