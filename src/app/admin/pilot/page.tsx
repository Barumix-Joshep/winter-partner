import { Suspense } from "react";
import Link from "next/link";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Row = {
  shop_id: string;
  shop_name: string;
  shop_type: string;
  signed_up_at: string;
  first_job_at: string | null;
  hours_to_first_job: number | null;
  jobs_total: number;
  weekly: number[];
  bid_jobs: number;
  bid_participation_pct: number | null;
  cancel_rate_pct: number | null;
  ai_calls: number;
  ai_calls_ok: number;
  ai_features_used: number;
  ai_cost_krw: number;
};

const date = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });
const hours = (h: number | null) => (h === null ? "아직" : h < 48 ? `${Math.round(h)}시간` : `${Math.round(h / 24)}일`);
const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
const won = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}원`;

// 본사: 시범 운영 지표 (P16-7). 샵 단위 집계만 보여 준다(손님·강사 개인정보 없음).
export default function PilotPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin" className="text-sm text-ink-muted">
        ‹ 본사 관리
      </Link>
      <h1 className="text-lg font-bold">시범 운영 지표</h1>
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <Metrics searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function Spark({ weekly }: { weekly: number[] }) {
  const max = Math.max(1, ...weekly);
  return (
    <span className="inline-flex h-6 items-end gap-0.5" aria-label={`최근 8주 주간 등록 ${weekly.join(", ")}건`}>
      {weekly.map((v, i) => (
        <span key={i} className="w-1.5 rounded-sm bg-brand" style={{ height: `${Math.max(8, (v / max) * 100)}%`, opacity: v ? 1 : 0.2 }} />
      ))}
    </span>
  );
}

async function Metrics({ searchParams }: { searchParams: SearchParams }) {
  await requireArea("admin");
  const includeTest = (await searchParams).test === "1";
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_pilot_metrics", { p_include_test: includeTest });
  const rows = (data ?? []) as Row[];
  const sum = (f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0);
  const weeklyTotal = Array.from({ length: 8 }, (_, i) => sum((r) => r.weekly[i] ?? 0));
  const bidJobs = sum((r) => r.bid_jobs);
  const firstJob = rows.filter((r) => r.hours_to_first_job !== null).map((r) => r.hours_to_first_job!).sort((a, b) => a - b);
  const median = firstJob.length ? firstJob[Math.floor(firstJob.length / 2)] : null;

  return (
    <>
      <p className="text-sm text-ink-muted">
        샵 단위 집계입니다. 주간 등록 수는 강습을 등록한 날 기준(월요일 시작) 최근 8주입니다.{" "}
        <Link href={includeTest ? "/admin/pilot" : "/admin/pilot?test=1"} className="text-brand underline">
          {includeTest ? "[테스트] 샵 빼기" : "[테스트] 샵 포함"}
        </Link>
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="샵" value={`${rows.length}곳`} />
        <Stat label="첫 강습까지 (중간값)" value={hours(median)} />
        <Stat label="이번 주 강습 등록" value={`${weeklyTotal[7]}건`} extra={<Spark weekly={weeklyTotal} />} />
        <Stat label="AI 비용 합계" value={won(sum((r) => Number(r.ai_cost_krw)))} />
      </div>
      {rows.length === 0 ? (
        <p className="rounded-[14px] border border-line bg-white p-5 text-sm text-ink-muted">아직 시범 샵이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-[14px] border border-line bg-white">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-surface text-xs text-ink-muted">
              <tr>
                <th className="px-3 py-2">샵</th>
                <th className="px-3 py-2">가입</th>
                <th className="px-3 py-2">첫 강습까지</th>
                <th className="px-3 py-2">주간 등록 (8주)</th>
                <th className="px-3 py-2">입찰 참여율</th>
                <th className="px-3 py-2">취소율</th>
                <th className="px-3 py-2">AI 사용</th>
                <th className="px-3 py-2">AI 비용</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.shop_id} className="border-t border-line">
                  <td className="px-3 py-2 font-medium">
                    {r.shop_name}
                    <span className="block text-xs font-normal text-ink-muted">{r.shop_type === "lesson_team" ? "강습팀" : "렌탈샵"} · 강습 {r.jobs_total}건</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{date(r.signed_up_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{hours(r.hours_to_first_job)}</td>
                  <td className="px-3 py-2">
                    <Spark weekly={r.weekly} /> <span className="text-xs text-ink-muted">이번 주 {r.weekly[7]}</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {pct(r.bid_participation_pct)} <span className="text-xs text-ink-muted">공고 {r.bid_jobs}</span>
                  </td>
                  <td className="px-3 py-2">{pct(r.cancel_rate_pct)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.ai_calls_ok}회 <span className="text-xs text-ink-muted">/ 기능 {r.ai_features_used}개{r.jobs_total ? ` · 강습당 ${(r.ai_calls_ok / r.jobs_total).toFixed(1)}회` : ""}</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{won(Number(r.ai_cost_krw))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs leading-5 text-ink-muted">
        입찰 참여율 = 입찰 공고 중 입찰이 1건 이상 들어온 비율. 취소율 = 등록한 강습 중 취소된 비율(손님·샵·강사 취소 모두). AI 사용 = 성공한 호출 수와 써 본 기능 수(전체 8개).
      </p>
    </>
  );
}

function Stat({ label, value, extra }: { label: string; value: string; extra?: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border border-line bg-white p-4">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="flex items-end justify-between gap-2 text-lg font-bold">
        {value}
        {extra}
      </p>
    </div>
  );
}
