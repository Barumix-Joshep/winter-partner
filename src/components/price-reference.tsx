import { createClient } from "@/lib/supabase/server";

// 입찰 금액 참고 (P14-8): 같은 스키장·종목·유형의 최근 30일 낙찰가. 3건 미만이면 숫자를 보여 주지 않는다.
export async function PriceReference({ jobId }: { jobId: string }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("bid_price_reference", { p_job_id: jobId });
  const r = ((data ?? [])[0] as { samples: number; median: number | null; low: number | null; high: number | null } | undefined) ?? null;
  if (!r) return null;
  const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
  return (
    <p className="mt-1 text-xs text-ink-muted">
      {r.median != null && r.low != null && r.high != null
        ? `참고 · 최근 30일 비슷한 강습 낙찰가 중앙값 ${won(r.median)} (${won(r.low)}~${won(r.high)}, ${r.samples}건)`
        : "참고 · 비슷한 강습 낙찰이 아직 적어 금액을 보여 드리지 않습니다"}
    </p>
  );
}
