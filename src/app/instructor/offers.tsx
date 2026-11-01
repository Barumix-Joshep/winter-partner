import { createClient } from "@/lib/supabase/server";
import { formatLessonTime } from "@/lib/shop/job-status";
import { LESSON_TYPES, PATCH_PAID_BY, type LessonType, type PatchPaidBy } from "@/lib/shop/job";
import { OfferButtons } from "./offer-buttons";
import { PreviousNotes } from "./previous-notes";

type Offer = {
  id: string;
  expires_at: string | null;
  jobs: {
    id: string;
    starts_at: string;
    ends_at: string;
    lesson_type: LessonType;
    student_count: number;
    instructor_rate: number | null;
    patch_paid_by: PatchPaidBy | null;
    note: string | null;
    sports: { name: string } | null;
    resorts: { name: string } | null;
    shops: { name: string } | null;
  } | null;
};

function remaining(expiresAt: string | null, now: number) {
  if (!expiresAt) return "";
  const h = Math.floor((new Date(expiresAt).getTime() - now) / 3600_000);
  return h >= 1 ? `${h}시간 남음` : "곧 마감";
}

// 받은 직접 의뢰 (프로토타입 IHome 상단 카드). 손님은 레벨만 보인다.
export async function Offers({ instructorId, now }: { instructorId: string; now: number }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("job_offers")
    .select(
      "id, expires_at, jobs(id, starts_at, ends_at, lesson_type, student_count, instructor_rate, patch_paid_by, note, sports(name), resorts(name), shops(name))",
    )
    .eq("instructor_id", instructorId)
    .eq("status", "pending")
    .or(`expires_at.is.null,expires_at.gt.${new Date(now).toISOString()}`)
    .order("expires_at");
  const offers = ((data ?? []) as unknown as Offer[]).filter((o) => o.jobs);
  const levels = await Promise.all(
    offers.map(async (o) => {
      const { data: l } = await supabase.rpc("job_customer_levels", { p_job_id: o.jobs!.id });
      return ((l ?? []) as { level: string | null }[]).map((x) => x.level).filter(Boolean).join(", ");
    }),
  );

  return (
    <>
      {offers.map((o, i) => {
        const j = o.jobs!;
        return (
          <section key={o.id} className="rounded-[14px] border border-[#F3D4A8] bg-[#FFF1E0] p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#B4560A]">직접 의뢰 · 응답 대기</span>
              <span className="text-[11px] text-[#9A5A1E]">{remaining(o.expires_at, now)}</span>
            </div>
            <p className="mt-1.5 text-[15px] font-bold">
              {formatLessonTime(j.starts_at, j.ends_at)} · {j.sports?.name} {LESSON_TYPES[j.lesson_type].label}
            </p>
            <p className="mt-0.5 text-xs text-[#7A3E06]">
              {j.shops?.name} · {j.resorts?.name}
              {levels[i] ? ` · ${levels[i]}` : ""} · 패치 {j.patch_paid_by ? PATCH_PAID_BY[j.patch_paid_by] : "미정"}
              {j.instructor_rate != null ? ` · ${j.instructor_rate.toLocaleString("ko-KR")}원` : ""}
            </p>
            {j.note && <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-xs">요청 사항 · {j.note}</p>}
            <div className="mt-2">
              <PreviousNotes jobId={j.id} />
            </div>
            <OfferButtons offerId={o.id} />
          </section>
        );
      })}
    </>
  );
}
