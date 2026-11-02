import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shop/my-shop";
import { ShopForm, type Resort } from "../new/shop-form";
import { updateShop } from "./actions";

export default function ShopSettingsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/shop/new");
  const supabase = await createClient();
  const [{ data: resorts }, { data: row }] = await Promise.all([
    supabase.from("resorts").select("id, name, region").eq("active", true).order("id"),
    supabase.from("shops").select("business_no, owner_name").eq("id", shop.id).single(),
  ]);
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-lg font-bold">샵 정보</h1>
      <p className="mt-1 text-sm text-ink-muted">사업자번호·대표자는 정산서에 들어갑니다.</p>
      <ShopForm
        resorts={(resorts ?? []) as Resort[]}
        onSubmit={updateShop}
        initial={{ type: shop.type, name: shop.name, businessNo: row?.business_no ?? null, ownerName: row?.owner_name ?? null, resortIds: shop.resorts.map((r) => r.id) }}
      />
    </div>
  );
}
