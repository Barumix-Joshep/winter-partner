import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { onboardingSteps, type OnboardingStatus } from "@/lib/shop/onboarding";
import { setOnboardingHidden } from "./onboarding-actions";

// 샵 홈 상단 시작 체크리스트 (P16-4). 완료는 자동 체크, 닫아도 아래 링크로 다시 연다.
export async function OnboardingCard({ shopId }: { shopId: string }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("shop_onboarding", { p_shop_id: shopId });
  const status = data as OnboardingStatus | null;
  if (!status) return null;
  const { steps, done, allDone, next } = onboardingSteps(status);
  if (allDone && status.hidden) return null;
  if (status.hidden) {
    return (
      <form action={setOnboardingHidden} className="-mb-2">
        <input type="hidden" name="hidden" value="false" />
        <button className="min-h-11 text-sm text-brand underline">시작 안내 다시 보기 ({done}/{steps.length})</button>
      </form>
    );
  }
  return (
    <section aria-labelledby="onboarding-title" className="rounded-[14px] border border-brand/30 bg-blue-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="onboarding-title" className="font-bold">
            {allDone ? "준비가 끝났습니다" : "겨울파트너 시작하기"}
          </h2>
          <p className="text-sm text-ink-muted">
            {done}/{steps.length} 완료{next ? ` · 다음: ${next.title}` : ""}
          </p>
        </div>
        <form action={setOnboardingHidden}>
          <input type="hidden" name="hidden" value="true" />
          <button className="min-h-11 rounded-[10px] px-3 text-sm text-ink-muted hover:bg-white">닫기</button>
        </form>
      </div>
      {!status.approved && <p className="mt-2 text-xs text-[#7A3E06]">본사 승인 전에는 전속 초대·강사 의뢰가 막혀 있습니다. 샵 정보와 손님 등록은 먼저 할 수 있습니다.</p>}
      <ol className="mt-3 flex flex-col gap-2">
        {steps.map((s, i) => (
          <li key={s.key} className={`rounded-[10px] bg-white p-3 ${s.done ? "opacity-70" : ""}`}>
            <p className="flex items-center gap-2 text-sm font-medium">
              <span
                aria-hidden
                className={`grid size-6 shrink-0 place-items-center rounded-full text-xs ${s.done ? "bg-brand text-white" : "border border-line text-ink-muted"}`}
              >
                {s.done ? "✓" : i + 1}
              </span>
              <span>
                {s.title}
                <span className="sr-only">{s.done ? " (완료)" : " (할 일)"}</span>
              </span>
            </p>
            {!s.done && (
              <>
                <p className="mt-1 pl-8 text-xs text-ink-muted">{s.desc}</p>
                <div className="mt-1 flex flex-wrap gap-x-4 pl-8">
                  {s.links.map((l) => (
                    <Link key={l.href} href={l.href} className="flex min-h-11 items-center text-sm text-brand underline">
                      {l.label}
                    </Link>
                  ))}
                </div>
              </>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
