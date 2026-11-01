import { Suspense } from "react";
import Link from "next/link";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyInstructorId } from "@/lib/instructor/profile";
import { busyCells, coveredCells, todayKst, weekDays, weekStartOf, weekWindow } from "@/lib/instructor/schedule";
import { formatLessonTime } from "@/lib/shop/job-status";
import { requestTime } from "@/lib/time";
import { WeekGrid } from "./week-grid";
import { CancelLesson } from "../cancel-lesson";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function SchedulePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-lg font-bold">일정</h1>
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <Schedule searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const shift = (week: string, days: number) => new Date(new Date(`${week}T00:00:00Z`).getTime() + days * 86400_000).toISOString().slice(0, 10);

async function Schedule({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireArea("instructor");
  const me = await getMyInstructorId(user.id);
  const today = todayKst(await requestTime());
  const q = (await searchParams).week;
  const raw = typeof q === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : today;
  const week = weekStartOf(raw);
  const days = weekDays(week);
  const win = weekWindow(week);

  const supabase = await createClient();
  const [{ data: avail }, { data: lessons }] = await Promise.all([
    supabase.from("availability").select("starts_at, ends_at").eq("instructor_id", me ?? "").lt("starts_at", win.to).gt("ends_at", win.from),
    supabase
      .from("assignments")
      .select("jobs!inner(id, starts_at, ends_at, status, sports(name), shops(name))")
      .eq("instructor_id", me ?? "")
      .neq("jobs.status", "canceled")
      .lt("jobs.starts_at", win.to)
      .gt("jobs.ends_at", win.from),
  ]);
  const now = await requestTime();
  const jobs = ((lessons ?? []) as unknown as { jobs: { id: string; starts_at: string; ends_at: string; status: string; sports: { name: string } | null; shops: { name: string } | null } }[])
    .map((l) => l.jobs)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  return (
    <>
      <div className="flex items-center justify-between text-sm">
        <Link href={`/instructor/schedule?week=${shift(week, -7)}`} className="flex min-h-11 items-center px-2 text-ink-muted">
          ‹ 지난주
        </Link>
        <span className="font-medium">
          {Number(days[0].slice(5, 7))}/{Number(days[0].slice(8))} ~ {Number(days[6].slice(5, 7))}/{Number(days[6].slice(8))}
        </span>
        <Link href={`/instructor/schedule?week=${shift(week, 7)}`} className="flex min-h-11 items-center px-2 text-ink-muted">
          다음 주 ›
        </Link>
      </div>
      <WeekGrid
        key={week}
        week={week}
        days={days}
        today={today}
        initial={[...coveredCells(avail ?? [], days)]}
        busy={[...busyCells(jobs, days)]}
      />
      <section>
        <h2 className="text-base font-bold">이번 주 확정 강습</h2>
        {jobs.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">없습니다.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {jobs.map((j) => (
              <li key={j.id} className="rounded-xl border border-line bg-white px-4 py-3 text-sm">
                <strong>{formatLessonTime(j.starts_at, j.ends_at)}</strong> {j.sports?.name} · {j.shops?.name}
                {j.status === "assigned" && new Date(j.starts_at).getTime() > now && (
                  <CancelLesson jobId={j.id} within24h={new Date(j.starts_at).getTime() - now < 86400_000} back={`/instructor/schedule?week=${week}`} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
