import { createClient } from "@/lib/supabase/server";

// 같은 손님의 지난 수업 메모 (같은 샵, 손님이 동의한 경우만. DB 함수 previous_lesson_notes가 확인한다)
export async function PreviousNotes({ jobId }: { jobId: string }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("previous_lesson_notes", { p_job_id: jobId });
  const notes = (data ?? []) as { lesson_date: string; sport: string | null; note: string }[];
  if (notes.length === 0) return null;
  return (
    <div className="rounded-lg border border-[#E1E6F0] bg-white px-3 py-2 text-xs">
      <p className="font-medium text-ink-muted">지난 수업 메모</p>
      <ul className="mt-1 flex flex-col gap-1">
        {notes.map((n, i) => (
          <li key={i}>
            <span className="text-ink-muted">{n.lesson_date.slice(5).replace("-", "/")}</span> {n.note}
          </li>
        ))}
      </ul>
    </div>
  );
}
