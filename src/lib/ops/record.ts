import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// 운영 기록(P16-2). 기록이 실패해도 원래 요청을 망치지 않는다.
export async function recordOpsEvent(kind: "server_error" | "cron_run", source: string, detail: string, ok: boolean) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const { error } = await createAdminClient().rpc("record_ops_event", { p_kind: kind, p_source: source, p_detail: detail, p_ok: ok });
    if (error) console.error("ops event failed", error.message);
  } catch (e) {
    console.error("ops event failed", e instanceof Error ? e.message : e);
  }
}
