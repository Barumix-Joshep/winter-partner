import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shop/my-shop";
import { formatLessonTime, jobStatusLabel, recentJobsCutoff } from "@/lib/shop/job-status";
import { LESSON_TYPES, type LessonType } from "@/lib/shop/job";
import { pageInfo, pageRange, parsePage } from "@/lib/paging";
import { Pager } from "@/components/pager";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const PAGE = 200;

export default function JobsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">강습 등록·입찰</h1>
          <p className="mt-1 text-sm text-ink-muted">강습 건을 올리고 전속 강사에게 의뢰하거나 프리랜서 입찰을 받습니다.</p>
        </div>
        <Link href="/shop/jobs/new" className="flex min-h-11 items-center rounded-[10px] bg-brand px-5 text-sm font-medium text-white">
          + 새 강습 건
        </Link>
      </div>
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <Jobs searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

type Row = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  assign_mode: string;
  lesson_type: LessonType;
  student_count: number;
  note: string | null;
  sports: { name: string } | null;
  resorts: { name: string } | null;
  job_customers: { customers: { name: string } | null }[];
};

async function Jobs({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireArea("shop");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/shop/new");
  const page = parsePage((await searchParams).page);
  const supabase = await createClient();
  const [from, to] = pageRange(page, PAGE);
  const { data, count } = await supabase
    .from("jobs")
    .select("id, starts_at, ends_at, status, assign_mode, lesson_type, student_count, note, sports(name), resorts(name), job_customers(customers(name))", { count: "exact" })
    .eq("shop_id", shop.id)
    .neq("status", "canceled")
    .gte("ends_at", recentJobsCutoff())
    .order("starts_at")
    .order("id")
    .range(from, to);
  const jobs = (data ?? []) as unknown as Row[];
  const info = pageInfo(page, PAGE, count ?? jobs.length);

  if (jobs.length === 0) {
    return <p className="rounded-[14px] border border-line bg-white p-5 text-sm text-ink-muted">등록된 강습이 없습니다.</p>;
  }
  return (
    <>
      <Pager info={info} href={(p) => `/shop/jobs?page=${p}`} />
      <ul className="flex flex-col gap-2">
        {jobs.map((j) => {
          const s = jobStatusLabel(j);
          const who = j.job_customers.map((c) => c.customers?.name).filter(Boolean).join(", ");
          return (
            <li key={j.id}>
              <Link href={`/shop/jobs/${j.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-line bg-white p-4 hover:border-brand">
              <div className="min-w-0">
                <p className="text-sm font-bold">
                  {formatLessonTime(j.starts_at, j.ends_at)} · {j.sports?.name} {LESSON_TYPES[j.lesson_type].label}
                  {j.lesson_type === "group" ? ` ${j.student_count}명` : ""}
                </p>
                <p className="mt-0.5 truncate text-xs text-ink-muted">
                  {j.resorts?.name}
                  {who ? ` · ${who}` : ""}
                  {j.note ? ` · ${j.note}` : ""}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${s.cls}`}>{s.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <Pager info={info} href={(p) => `/shop/jobs?page=${p}`} />
    </>
  );
}
