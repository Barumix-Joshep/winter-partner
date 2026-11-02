import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shop/my-shop";
import { isAiEnabled } from "@/lib/ai/flags";
import { RevisitList } from "./drafts";

// 재방문 후보 (비시즌): 광고 수신 동의가 유효한 손님만. 알림톡 광고 제약 때문에 샵이 직접 보내는 복사용 문구.
export default function RevisitPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">재방문 안내</h1>
        <p className="mt-1 text-sm text-ink-muted">
          광고 수신에 직접 동의했고 2년이 지나지 않은 손님만 보입니다. 지난 시즌 강습이 많은 순입니다. 문구는 복사해 직접 보내 주세요(광고 문자에는 &lsquo;(광고)&rsquo; 표시와 수신 거부 방법이 필요합니다).
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <Candidates />
      </Suspense>
    </div>
  );
}

async function Candidates() {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/shop/new");
  const supabase = await createClient();
  const { data } = await supabase.rpc("revisit_candidates", { p_shop_id: shop.id });
  const rows = (data ?? []) as { customer_id: string; name: string; level: string | null; lessons: number; last_lesson: string | null; sport: string | null }[];
  if (rows.length === 0) {
    return <p className="rounded-[14px] border border-line bg-white p-5 text-sm text-ink-muted">대상 손님이 없습니다. 손님이 QR·링크에서 광고 수신에 동의하면 여기에 보입니다.</p>;
  }
  const { data: phones } = await supabase.from("customers").select("id, phone").in("id", rows.map((r) => r.customer_id));
  const phoneOf = new Map((phones ?? []).map((p) => [p.id as string, p.phone as string | null]));
  return <RevisitList rows={rows.map((r) => ({ ...r, phone: phoneOf.get(r.customer_id) ?? null }))} ai={await isAiEnabled(shop.id, "revisit")} />;
}
