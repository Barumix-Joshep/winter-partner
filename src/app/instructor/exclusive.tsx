import { createClient } from "@/lib/supabase/server";
import { acceptInvite, declineInvite, leaveExclusive } from "./actions";

type ShopName = { shops: { name: string } | null };

// 전속 상태와 받은 전속 제안
export async function Exclusive({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { data: me } = await supabase.from("instructors").select("id").eq("user_id", userId).maybeSingle();
  if (!me) return null;
  const [{ data: current }, { data: invites }] = await Promise.all([
    supabase.from("shop_instructors").select("shops(name)").eq("instructor_id", me.id).maybeSingle(),
    supabase
      .from("exclusive_invites")
      .select("id, exclusive_rate, shops(name)")
      .eq("instructor_id", me.id)
      .eq("status", "pending")
      .order("created_at"),
  ]);
  const shop = (current as unknown as ShopName | null)?.shops?.name;
  const offers = (invites ?? []) as unknown as ({ id: string; exclusive_rate: number | null } & ShopName)[];

  return (
    <>
      {shop && (
        <section className="flex items-center justify-between gap-3 rounded-[14px] border border-line bg-white p-4">
          <div>
            <p className="text-sm font-bold">{shop} 전속</p>
            <p className="text-xs text-ink-muted">전속 중에는 다른 샵 입찰 공고를 볼 수 없습니다.</p>
          </div>
          <form action={leaveExclusive}>
            <button className="min-h-11 px-3 text-sm text-ink-muted">전속 끝내기</button>
          </form>
        </section>
      )}
      {offers.map((o) => (
        <section key={o.id} className="rounded-[14px] border border-[#F3D4A8] bg-[#FFF1E0] p-4">
          <p className="text-xs font-bold text-[#B4560A]">전속 제안</p>
          <p className="mt-1 text-[15px] font-bold">{o.shops?.name ?? "샵"}</p>
          <p className="mt-0.5 text-xs text-[#7A3E06]">
            {o.exclusive_rate ? `전속 단가 ${o.exclusive_rate.toLocaleString("ko-KR")}원 · ` : ""}
            수락하면 진행 중인 입찰은 철회되고 다른 제안은 거절됩니다.
          </p>
          <div className="mt-3 flex gap-2">
            <form action={acceptInvite} className="flex-1">
              <input type="hidden" name="id" value={o.id} />
              <button disabled={!!shop} className="min-h-11 w-full rounded-[10px] bg-brand text-sm font-medium text-white disabled:opacity-50">
                수락
              </button>
            </form>
            <form action={declineInvite} className="flex-1">
              <input type="hidden" name="id" value={o.id} />
              <button className="min-h-11 w-full rounded-[10px] border border-[#D9A46A] bg-white text-sm text-[#7A3E06]">거절</button>
            </form>
          </div>
        </section>
      ))}
    </>
  );
}
