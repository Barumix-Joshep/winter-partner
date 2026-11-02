import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { LIMITS, limitKey, type LimitName } from "./limits";

// 접속 IP (Vercel은 x-forwarded-for 첫 값이 실제 IP)
export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

type Check = [LimitName, string];

// 시도 전에 확인한다. "all"은 여기서 한 번 세고, "fail"은 세지 않고 보기만 한다.
// 제한에 걸린 첫 이름을 돌려준다. DB 오류면 막지 않는다(정상 사용 우선).
export async function overLimit(checks: Check[]): Promise<LimitName | null> {
  const db = createAdminClient();
  const results = await Promise.all(
    checks.map(async ([name, subject]) => {
      const l = LIMITS[name];
      const fn = l.count === "all" ? "public_rate_limit" : "public_rate_peek";
      const { data, error } = await db.rpc(fn, { p_key: limitKey(name, subject), p_max: l.max, p_window_seconds: l.windowSeconds });
      return !error && data === false ? name : null;
    }),
  );
  return results.find((r) => r !== null) ?? null;
}

// "fail" 제한: 실패했을 때 센다
export async function countFailure(checks: Check[]) {
  const db = createAdminClient();
  await Promise.all(
    checks.map(([name, subject]) =>
      db.rpc("public_rate_limit", { p_key: limitKey(name, subject), p_max: LIMITS[name].max, p_window_seconds: LIMITS[name].windowSeconds }),
    ),
  );
}
