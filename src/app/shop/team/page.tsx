import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shop/my-shop";
import { cancelInvite, releaseExclusive } from "./actions";

export default function TeamPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">전속 강사</h1>
        <p className="mt-1 text-sm text-ink-muted">
          전속은 강사가 제안을 수락해야 맺어집니다. 전속 강사는 다른 샵 입찰 공고를 볼 수 없고, 다른 샵 검색에도 나오지 않습니다.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <Team />
      </Suspense>
    </div>
  );
}

type Named = { instructors: { profiles: { name: string } | null } | null };

async function Team() {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/shop/new");
  const supabase = await createClient();
  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase
      .from("shop_instructors")
      .select("instructor_id, exclusive_rate, joined_at, instructors(profiles(name))")
      .eq("shop_id", shop.id)
      .order("joined_at"),
    supabase
      .from("exclusive_invites")
      .select("id, created_at, instructors(profiles(name))")
      .eq("shop_id", shop.id)
      .eq("status", "pending")
      .order("created_at"),
  ]);
  const team = (members ?? []) as unknown as ({ instructor_id: string; exclusive_rate: number | null; joined_at: string } & Named)[];
  const pending = (invites ?? []) as unknown as ({ id: string; created_at: string } & Named)[];

  return (
    <>
      {shop.status !== "approved" && (
        <p className="rounded-[14px] border border-[#F3D4A8] bg-[#FFF1E0] p-4 text-sm text-[#7A3E06]">
          본사 승인 뒤에 전속을 제안할 수 있습니다.
        </p>
      )}
      <section>
        <h2 className="text-base font-bold">전속 {team.length}명</h2>
        {team.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">
            아직 없습니다. <Link href="/shop/instructors" className="text-brand underline">강사 찾기</Link>에서 전속을 제안해 보세요.
          </p>
        ) : (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {team.map((m) => (
              <li key={m.instructor_id} className="flex items-center justify-between gap-3 rounded-[14px] border border-line bg-white p-4">
                <div>
                  <p className="font-bold">{m.instructors?.profiles?.name}</p>
                  <p className="text-xs text-ink-muted">
                    {new Date(m.joined_at).toLocaleDateString("ko-KR")}부터
                    {m.exclusive_rate ? ` · 전속 단가 ${m.exclusive_rate.toLocaleString("ko-KR")}원` : ""}
                  </p>
                </div>
                <form action={releaseExclusive}>
                  <input type="hidden" name="instructor_id" value={m.instructor_id} />
                  <button className="min-h-11 px-3 text-sm text-ink-muted">해지</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
      {pending.length > 0 && (
        <section>
          <h2 className="text-base font-bold">답을 기다리는 제안 {pending.length}건</h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {pending.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-[14px] border border-dashed border-line bg-white p-4">
                <p className="font-bold">{p.instructors?.profiles?.name}</p>
                <form action={cancelInvite}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="min-h-11 px-3 text-sm text-ink-muted">제안 취소</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
