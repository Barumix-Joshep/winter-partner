import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shop/my-shop";
import { requestTime } from "@/lib/time";
import { LinkForm } from "./link-form";
import { revokeLink } from "./actions";

// 카운터용 손님 셀프 등록 QR: 발급·인쇄·폐기
export default function RegisterQrPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="print:hidden">
        <h1 className="text-2xl font-bold">손님 셀프 등록 QR</h1>
        <p className="mt-1 text-sm text-ink-muted">
          카운터에 QR을 붙여 두면 손님이 휴대폰으로 직접 정보를 입력합니다. 같은 연락처 손님이 있으면 손님 목록에 &lsquo;확인 필요&rsquo;로 표시됩니다. QR이 밖으로 퍼졌다면 폐기하고 새로 만드세요.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <Links />
      </Suspense>
    </div>
  );
}

async function Links() {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/shop/new");
  const supabase = await createClient();
  const now = await requestTime();
  const { data } = await supabase
    .from("registration_links")
    .select("id, label, expires_at, revoked_at, created_at")
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false })
    .limit(30);
  const links = (data ?? []) as { id: string; label: string; expires_at: string; revoked_at: string | null; created_at: string }[];
  const day = (iso: string) => new Date(Date.parse(iso) + 9 * 3600_000).toISOString().slice(0, 10);
  return (
    <>
      {shop.status !== "approved" ? (
        <p className="rounded-[14px] border border-[#F3D4A8] bg-[#FFF1E0] p-4 text-sm text-[#7A3E06]">본사 승인 뒤에 QR을 만들 수 있습니다.</p>
      ) : (
        <LinkForm shopName={shop.name} />
      )}
      <section className="print:hidden">
        <h2 className="text-base font-bold">발급한 링크</h2>
        {links.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">아직 없습니다.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {links.map((l) => {
              const active = !l.revoked_at && Date.parse(l.expires_at) > now;
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-3 rounded-[14px] border border-line bg-white px-4 py-3 text-sm">
                  <span className="flex-1 font-medium">{l.label}</span>
                  <span className="text-xs text-ink-muted">
                    {day(l.created_at)} 발급 · {l.revoked_at ? `${day(l.revoked_at)} 폐기` : `${day(l.expires_at)}까지`}
                  </span>
                  {active ? (
                    <form action={revokeLink}>
                      <input type="hidden" name="id" value={l.id} />
                      <button className="min-h-11 px-2 text-xs text-danger underline">폐기</button>
                    </form>
                  ) : (
                    <span className="text-xs text-ink-muted">사용 안 됨</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
