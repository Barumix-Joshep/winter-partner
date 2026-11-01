import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shop/my-shop";
import { JobForm } from "./job-form";

export default function NewJobPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">새 강습 건</h1>
        <p className="mt-1 text-sm text-ink-muted">
          먼저 임시 저장합니다. 저장한 뒤 전속 강사에게 직접 의뢰하거나 프리랜서에게 입찰 공고를 낼 수 있습니다.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <NewJob />
      </Suspense>
    </div>
  );
}

async function NewJob() {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/shop/new");
  const supabase = await createClient();
  const [{ data: sports }, { data: customers }] = await Promise.all([
    supabase.from("sports").select("id, name").order("id"),
    supabase.from("customers").select("id, name, level").eq("shop_id", shop.id).order("name").limit(500),
  ]);
  return <JobForm resorts={shop.resorts} sports={sports ?? []} customers={customers ?? []} />;
}
