import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shop/my-shop";
import { aiKeyConfigured } from "@/lib/ai/flags";
import { AI_FEATURE_LABEL, type AiFeature } from "@/lib/ai/types";
import { setShopAi } from "./actions";

// 샵이 쓰는 AI 도우미 켜기/끄기. 끄면 그 화면은 기존 수동 흐름 그대로다.
const SHOP_FEATURES: { f: AiFeature; detail: string }[] = [
  { f: "intake", detail: "문자·카톡으로 받은 예약을 붙여 넣으면 강습 등록 칸을 미리 채웁니다." },
  { f: "bid_assist", detail: "입찰이 여러 건일 때 추천과 이유를 보여 줍니다. 선정은 직접 합니다." },
  { f: "customer_summary", detail: "손님 카드에 강습 이력·수업 메모 요약과 다음 연락 문구 초안을 보여 줍니다." },
  { f: "health_check", detail: "메모에 건강 정보로 보이는 문장이 있으면 한 번 더 알려 줍니다." },
  { f: "revisit", detail: "광고 수신에 동의한 손님에게 보낼 재방문 안내 문구 초안을 만듭니다." },
];

export default function ShopAiPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">AI 도우미 설정</h1>
        <p className="mt-1 text-sm text-ink-muted">
          AI는 제안만 하고 확정은 직접 합니다. 손님 이름·연락처는 AI에 보내지 않습니다(&lsquo;손님A&rsquo;처럼 바꿔 보냅니다). 끄면 지금처럼 직접 입력하는 방식 그대로입니다.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <Settings />
      </Suspense>
    </div>
  );
}

async function Settings() {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/shop/new");
  const supabase = await createClient();
  const { data } = await supabase.from("shops").select("ai_features").eq("id", shop.id).single();
  const mine = (data?.ai_features ?? {}) as Record<string, boolean>;
  return (
    <>
      {!aiKeyConfigured() && (
        <p className="rounded-[14px] border border-line bg-white p-4 text-sm text-ink-muted">지금은 AI 서비스가 연결되지 않아 모든 도우미가 꺼져 있습니다.</p>
      )}
      <ul className="flex flex-col gap-2">
        {SHOP_FEATURES.map(({ f, detail }) => {
          const on = mine[f] !== false;
          return (
            <li key={f} className="flex flex-wrap items-center gap-3 rounded-[14px] border border-line bg-white p-4">
              <div className="min-w-48 flex-1">
                <p className="text-sm font-bold">{AI_FEATURE_LABEL[f]}</p>
                <p className="text-xs text-ink-muted">{detail}</p>
              </div>
              <form action={setShopAi}>
                <input type="hidden" name="feature" value={f} />
                <input type="hidden" name="enabled" value={on ? "false" : "true"} />
                <button aria-label={`${AI_FEATURE_LABEL[f]} ${on ? "끄기" : "켜기"}`} className={`min-h-11 rounded-lg px-4 text-sm font-medium ${on ? "bg-[#E6F4EA] text-[#1B6B3A]" : "bg-[#EEF1F6] text-ink-muted"}`}>
                  {on ? "켜짐" : "꺼짐"}
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </>
  );
}
