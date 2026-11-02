import { createClient } from "@/lib/supabase/server";
import { formatLessonTime } from "@/lib/shop/job-status";
import { LESSON_TYPES, type LessonType } from "@/lib/shop/job";
import { ReportForm } from "./report-form";
import { isAiEnabled } from "@/lib/ai/flags";

type Row = {
  jobs: { id: string; shop_id: string; starts_at: string; ends_at: string; status: string; lesson_type: LessonType; sports: { name: string } | null; shops: { name: string } | null };
};

// 시작된 확정 강습 중 아직 보고하지 않은 것 (프로토타입 IHome "완료 보고 필요")
export async function ToReport({ instructorId, now }: { instructorId: string; now: number }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("instructor_assignments")
    .select("jobs!inner(id, shop_id, starts_at, ends_at, status, lesson_type, sports(name), shops(name))")
    .eq("instructor_id", instructorId)
    .is("completed_at", null)
    .eq("jobs.status", "assigned")
    .lte("jobs.starts_at", new Date(now).toISOString());
  const rows = ((data ?? []) as unknown as Row[]).sort((a, b) => a.jobs.starts_at.localeCompare(b.jobs.starts_at));
  if (rows.length === 0) return null;
  const tidy = new Map(await Promise.all([...new Set(rows.map((r) => r.jobs.shop_id))].map(async (s) => [s, await isAiEnabled(s, "note_tidy")] as const)));
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[15px] font-bold">완료 보고 필요 {rows.length}건</h2>
      {rows.map(({ jobs: j }) => (
        <article key={j.id} className="rounded-[14px] border border-line bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[15px] font-bold">{formatLessonTime(j.starts_at, j.ends_at)}</p>
            <span className="rounded-full bg-[#FFF1E0] px-2.5 py-1 text-[11px] font-medium text-[#B4560A]">완료 보고 필요</span>
          </div>
          <p className="mt-0.5 text-sm">
            {j.sports?.name} {LESSON_TYPES[j.lesson_type].label} · {j.shops?.name}
          </p>
          <ReportForm jobId={j.id} aiTidy={!!tidy.get(j.shop_id)} />
        </article>
      ))}
    </section>
  );
}
