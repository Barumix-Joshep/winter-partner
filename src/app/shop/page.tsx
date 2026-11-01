import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Placeholder } from "@/components/placeholder";

export default function ShopHome() {
  return (
    <Suspense>
      <ShopGate />
    </Suspense>
  );
}

// 샵이 아직 없는 샵 관리자는 등록부터. 레이아웃 가드와 동시에 돌므로 여기서도 역할을 확인한다.
async function ShopGate() {
  const user = await requireArea("shop");
  if (!user.hasShop) redirect("/shop/new");

  const supabase = await createClient();
  const { data: shop } = await supabase
    .from("shop_members")
    .select("shops(name, status)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  const info = shop?.shops as unknown as { name: string; status: string } | null;

  return (
    <div className="flex flex-col gap-4">
      {info?.status === "pending" && (
        <p className="rounded-[14px] border border-[#F3D4A8] bg-[#FFF1E0] p-4 text-sm text-[#7A3E06]">
          <strong>{info.name}</strong> 등록을 본사에서 확인하고 있습니다. 승인되면 강사에게 샵이 보입니다.
        </p>
      )}
      <Placeholder title="오늘 일정" next="샵 오늘 일정 화면이 여기에 들어옵니다 (P5-5)." />
    </div>
  );
}
