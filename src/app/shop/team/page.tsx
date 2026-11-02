import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shop/my-shop";
import { cancelInvite, releaseExclusive, setPayType } from "./actions";
import { PAY_TYPES, payTypeOf } from "@/lib/settlement/pay-type";

export default function TeamPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">전속 강사</h1>
        <p className="mt-1 text-sm text-ink-muted">
          전속은 강사가 제안을 수락해야 맺어집니다. 전속 강사는 다른 샵 입찰 공고를 볼 수 없고, 다른 샵 검색에도 나오지 않습니다.
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          지급 방식은 정산서에 원천세를 어떻게 적을지 정합니다. 기본은 사업소득 3.3%이고, 근로자로 대우해 원천징수를 샵에서 따로 하시면 &ldquo;원천징수 샵
          별도 처리&rdquo;를 고르세요(원천세 0원으로 표시). 바꾸면 다음 집계부터 적용되고, 이미 발행한 정산서는 그대로입니다.
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
  const [{ data: members }, { data: invites }, { data: logs }] = await Promise.all([
    supabase
      .from("shop_instructors")
      .select("instructor_id, exclusive_rate, joined_at, pay_type, instructors(profiles(name))")
      .eq("shop_id", shop.id)
      .order("joined_at"),
    supabase
      .from("exclusive_invites")
      .select("id, created_at, instructors(profiles(name))")
      .eq("shop_id", shop.id)
      .eq("status", "pending")
      .order("created_at"),
    supabase
      .from("shop_instructor_pay_type_log")
      .select("instructor_id, old_pay_type, new_pay_type, changed_at")
      .eq("shop_id", shop.id)
      .order("changed_at", { ascending: false })
      .limit(50),
  ]);
  const team = (members ?? []) as unknown as ({ instructor_id: string; exclusive_rate: number | null; joined_at: string; pay_type: string } & Named)[];
  const lastChange = new Map<string, { old_pay_type: string; new_pay_type: string; changed_at: string }>();
  for (const l of logs ?? []) if (!lastChange.has(l.instructor_id)) lastChange.set(l.instructor_id, l);
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
            아직 없습니다. <Link href="/shop/instructors" className="text-brand underline">강사 찾기</Link>에서 전속을 제안하거나, <Link href="/shop/import?type=instructors" className="text-brand underline">강사 명단을 한꺼번에 올려</Link> 초대해 보세요.
          </p>
        ) : (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {team.map((m) => {
              const last = lastChange.get(m.instructor_id);
              return (
                <li key={m.instructor_id} className="flex flex-col gap-3 rounded-[14px] border border-line bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
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
                  </div>
                  <form action={setPayType} className="flex flex-wrap items-end gap-2 border-t border-[#EEF1F6] pt-3">
                    <input type="hidden" name="instructor_id" value={m.instructor_id} />
                    <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-ink-muted">
                      지급 방식 <span className="text-[#7A3E06]">세무 확인 후 선택하세요</span>
                      <select
                        name="pay_type"
                        defaultValue={m.pay_type}
                        aria-label={`${m.instructors?.profiles?.name ?? ""} 지급 방식`}
                        className="min-h-11 rounded-lg border border-[#CBD3E1] bg-white px-3 text-sm text-ink"
                      >
                        {Object.entries(PAY_TYPES).map(([code, p]) => (
                          <option key={code} value={code}>
                            {p.label}
                            {code === "business_3_3" ? " (기본)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="min-h-11 rounded-[10px] border border-line px-4 text-sm font-medium">저장</button>
                    {last && (
                      <p className="w-full text-xs text-ink-muted">
                        {new Date(last.changed_at).toLocaleDateString("ko-KR")} 변경: {payTypeOf(last.old_pay_type, false).label} → {payTypeOf(last.new_pay_type, false).label}
                      </p>
                    )}
                  </form>
                </li>
              );
            })}
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
