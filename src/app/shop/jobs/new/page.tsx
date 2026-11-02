import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shop/my-shop";
import { JobForm } from "./job-form";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function NewJobPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">새 강습 건</h1>
        <p className="mt-1 text-sm text-ink-muted">
          먼저 임시 저장합니다. 저장한 뒤 전속 강사에게 직접 의뢰하거나 프리랜서에게 입찰 공고를 낼 수 있습니다.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <NewJob searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function NewJob({ searchParams }: { searchParams: SearchParams }) {
  const pre = (await searchParams).customer;
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/shop/new");
  const supabase = await createClient();
  const [{ data: sports }, { data: customers }] = await Promise.all([
    supabase.from("sports").select("id, name").order("id"),
    supabase.from("customers").select("id, name, level").eq("shop_id", shop.id).is("anonymized_at", null).order("name").limit(500),
  ]);
  const list = customers ?? [];
  const defaultCustomerId = typeof pre === "string" && list.some((c) => c.id === pre) ? pre : "";
  return <JobForm resorts={shop.resorts} sports={sports ?? []} customers={list} defaultCustomerId={defaultCustomerId} />;
}
