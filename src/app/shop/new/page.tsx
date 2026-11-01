import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ShopForm, type Resort } from "./shop-form";

export default function NewShopPage() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
      <NewShop />
    </Suspense>
  );
}

async function NewShop() {
  const user = await requireArea("shop");
  if (user.hasShop) redirect("/shop"); // 1단계는 관리자당 샵 하나

  const supabase = await createClient();
  const { data } = await supabase.from("resorts").select("id, name, region").eq("active", true).order("id");
  const resorts: Resort[] = data ?? [];

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-lg font-bold">샵·강습팀 등록</h1>
      <p className="mt-1 text-sm text-ink-muted">등록하면 본사 확인 뒤 승인됩니다. 승인 전에도 준비는 할 수 있습니다.</p>
      <ShopForm resorts={resorts} />
    </div>
  );
}
