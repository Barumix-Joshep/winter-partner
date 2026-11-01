import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/session";
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
  return <Placeholder title="오늘 일정" next="샵 오늘 일정 화면이 여기에 들어옵니다 (P5-5)." />;
}
