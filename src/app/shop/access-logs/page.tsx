import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shop/my-shop";
import { AccessLogTable, type AccessLogRow } from "@/components/access-log-table";

// 우리 샵 접속 기록: 손님 연락처 열람, 엑셀·PDF 다운로드 (2년 보관, 고칠 수 없음)
export default function AccessLogsPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">접속 기록</h1>
        <p className="mt-1 text-sm text-ink-muted">손님 연락처를 열람하거나 정산 자료를 내려받은 기록입니다. 2년 동안 보관하고, 누구도 고치거나 지울 수 없습니다.</p>
      </div>
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <Logs />
      </Suspense>
    </div>
  );
}

async function Logs() {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/shop/new");
  const supabase = await createClient();
  const { data } = await supabase
    .from("access_logs")
    .select("id, shop_id, actor_name, action, target_id, detail, created_at")
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false })
    .limit(200);
  return <AccessLogTable rows={(data ?? []) as AccessLogRow[]} />;
}
