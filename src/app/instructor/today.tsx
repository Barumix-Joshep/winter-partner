import { createClient } from "@/lib/supabase/server";
import { todayKst } from "@/lib/instructor/schedule";
import { formatLessonTime } from "@/lib/shop/job-status";
import { LESSON_TYPES, type LessonType } from "@/lib/shop/job";
import { PHASE_LABEL, dayWindowKst, lessonPhase, monthWindowKst, shiftDate } from "@/lib/shop/today";
import { PreviousNotes } from "./previous-notes";

type Lesson = {
  final_rate: number;
  via_shop_id: string | null; // 팀 강습: 금액은 팀 몫이라 강사에게 보이지 않는다
  jobs: { id: string; starts_at: string; ends_at: string; status: string; lesson_type: LessonType; note: string | null; sports: { name: string } | null; shops: { name: string } | null };
};

// 강사 홈 요약과 오늘·내일 강습 (프로토타입 IHome). 손님은 레벨만.
export async function InstructorToday({ instructorId, now, children }: { instructorId: string; now: number; children?: React.ReactNode }) {
  const supabase = await createClient();
  const today = todayKst(now);
  const span = { from: dayWindowKst(today).from, to: dayWindowKst(shiftDate(today, 1)).to };
  const month = monthWindowKst(today);
  const [{ data: lessons }, { data: monthRows }, { count: offers }] = await Promise.all([
    supabase
      .from("instructor_assignments")
      .select("final_rate, via_shop_id, jobs!inner(id, starts_at, ends_at, status, lesson_type, note, sports(name), shops(name))")
      .eq("instructor_id", instructorId)
      .neq("jobs.status", "canceled")
      .gte("jobs.starts_at", span.from)
      .lt("jobs.starts_at", span.to),
    supabase
      .from("instructor_assignments")
      .select("final_rate, via_shop_id, jobs!inner(status)")
      .eq("instructor_id", instructorId)
      .neq("jobs.status", "canceled")
      .gte("jobs.starts_at", month.from)
      .lt("jobs.starts_at", month.to),
    supabase
      .from("job_offers")
      .select("id", { count: "exact", head: true })
      .eq("instructor_id", instructorId)
      .eq("status", "pending")
      .or(`expires_at.is.null,expires_at.gt.${new Date(now).toISOString()}`),
  ]);
  const all = ((lessons ?? []) as unknown as Lesson[]).sort((a, b) => a.jobs.starts_at.localeCompare(b.jobs.starts_at));
  const tomorrowFrom = new Date(dayWindowKst(shiftDate(today, 1)).from).getTime();
  const todays = all.filter((l) => new Date(l.jobs.starts_at).getTime() < tomorrowFrom);
  const tomorrows = all.filter((l) => new Date(l.jobs.starts_at).getTime() >= tomorrowFrom);
  // 팀 강습은 팀이 정산받으므로 내 예정액에서 뺀다
  const monthTotal = ((monthRows ?? []) as { final_rate: number; via_shop_id: string | null }[]).reduce((s, r) => s + (r.via_shop_id ? 0 : r.final_rate), 0);
  const levels = await Promise.all(
    todays.map(async (l) => {
      const { data } = await supabase.rpc("job_customer_levels", { p_job_id: l.jobs.id });
      return ((data ?? []) as { level: string | null }[]).map((x) => x.level).filter(Boolean).join(", ");
    }),
  );

  return (
    <>
      <div className="grid grid-cols-3 gap-2 rounded-[14px] bg-navy p-3 text-white">
        <Stat label="오늘 강습" value={`${todays.length}건`} />
        <Stat label="받은 의뢰" value={`${offers ?? 0}건`} accent={(offers ?? 0) > 0} />
        <Stat label={`${Number(today.slice(5, 7))}월 예정액`} value={manwon(monthTotal)} />
      </div>

      {children}

      <h2 className="mt-1 text-[15px] font-bold">오늘 강습</h2>
      {todays.length === 0 && <p className="text-sm text-ink-muted">오늘은 강습이 없습니다.</p>}
      {todays.map((l, i) => {
        const p = PHASE_LABEL[lessonPhase(l.jobs, now)];
        return (
          <article key={l.jobs.id} className="flex flex-col gap-2 rounded-[14px] border border-line bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-[17px] font-bold">{formatLessonTime(l.jobs.starts_at, l.jobs.ends_at).split(" ")[1].replace("~", " ~ ")}</p>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${p.cls}`}>{p.label}</span>
            </div>
            <p className="text-sm font-medium">
              {l.jobs.sports?.name} {LESSON_TYPES[l.jobs.lesson_type].label}
              {levels[i] ? ` · ${levels[i]}` : ""}
            </p>
            <p className="text-xs text-ink-muted">{l.jobs.shops?.name} · {l.via_shop_id ? "팀 강습 (팀 정산)" : `${l.final_rate.toLocaleString("ko-KR")}원`}</p>
            {l.jobs.note && <p className="rounded-lg bg-surface px-3 py-2 text-xs text-[#35466A]">손님 메모 · {l.jobs.note}</p>}
            <PreviousNotes jobId={l.jobs.id} />
          </article>
        );
      })}

      {tomorrows.length > 0 && (
        <>
          <h2 className="mt-1 text-[15px] font-bold">내일</h2>
          {tomorrows.map((l) => (
            <div key={l.jobs.id} className="flex justify-between rounded-[14px] border border-line bg-white p-4 text-[13px]">
              <span>
                <strong>{formatLessonTime(l.jobs.starts_at, l.jobs.ends_at).split(" ")[1].split("~")[0]}</strong> {l.jobs.sports?.name}{" "}
                {LESSON_TYPES[l.jobs.lesson_type].label} · {l.jobs.shops?.name}
              </span>
              <span className="text-ink-muted">확정</span>
            </div>
          ))}
        </>
      )}
    </>
  );
}

function manwon(n: number) {
  return n >= 10000 ? `${Math.round(n / 10000).toLocaleString("ko-KR")}만` : `${n.toLocaleString("ko-KR")}원`;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-[10px] bg-navy-2 px-3 py-2.5">
      <p className="text-[11px] text-navy-muted">{label}</p>
      <p className={`text-lg font-bold ${accent ? "text-[#F2994A]" : ""}`}>{value}</p>
    </div>
  );
}
