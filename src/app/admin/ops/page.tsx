import { Suspense } from "react";
import Link from "next/link";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

type Summary = {
  errors_1h: number;
  errors_24h: number;
  recent_errors: { source: string; detail: string | null; created_at: string }[];
  crons: { source: string; ok: boolean; detail: string | null; created_at: string }[];
  ai_calls_24h: number;
  ai_fails_24h: number;
  thresholds: { errors_per_hour: number; ai_min_calls: number; ai_fail_pct: number };
};

const CRON: Record<string, string> = {
  "/api/notify/dispatch": "놓친 알림 다시 보내기 (매일 09:00)",
  "/api/maintenance/daily": "보관 기간 지난 정보 정리 (매일 03:00)",
};

const time = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

// 본사: 서버 오류·크론 실행·AI 실패율 (P16-2). 기준을 넘으면 본사 관리자에게 알림이 간다.
export default function OpsPage() {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin" className="text-sm text-ink-muted">
        ‹ 본사 관리
      </Link>
      <h1 className="text-lg font-bold">운영 상태</h1>
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <Ops />
      </Suspense>
    </div>
  );
}

async function Ops() {
  await requireArea("admin");
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_ops_summary");
  const s = data as Summary | null;
  if (!s) return <p className="text-sm text-ink-muted">불러오지 못했습니다.</p>;
  const failPct = s.ai_calls_24h ? Math.round((s.ai_fails_24h / s.ai_calls_24h) * 100) : 0;
  return (
    <>
      <p className="text-sm text-ink-muted">
        서버 오류가 한 시간에 {s.thresholds.errors_per_hour}건 이상이거나, AI 호출이 한 시간에 {s.thresholds.ai_min_calls}회 이상이면서 {s.thresholds.ai_fail_pct}% 이상 실패하면 본사 관리자에게 알림이 갑니다(한 시간에 한 번).
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="서버 오류 (1시간)" value={`${s.errors_1h}건`} warn={s.errors_1h >= s.thresholds.errors_per_hour} />
        <Stat label="서버 오류 (24시간)" value={`${s.errors_24h}건`} />
        <Stat label="AI 호출 (24시간)" value={`${s.ai_calls_24h}회`} />
        <Stat label="AI 실패율 (24시간)" value={`${failPct}%`} warn={failPct >= s.thresholds.ai_fail_pct && s.ai_calls_24h >= s.thresholds.ai_min_calls} />
      </div>

      <h2 className="font-bold">크론 마지막 실행</h2>
      <ul className="flex flex-col gap-2">
        {Object.entries(CRON).map(([path, label]) => {
          const c = s.crons.find((x) => x.source === path);
          return (
            <li key={path} className="rounded-[14px] border border-line bg-white p-4 text-sm">
              <p className="font-medium">{label}</p>
              <p className={c && !c.ok ? "text-danger" : "text-ink-muted"}>
                {c ? `${time(c.created_at)} · ${c.ok ? "성공" : "실패"}` : "아직 실행 기록이 없습니다"}
              </p>
            </li>
          );
        })}
      </ul>

      <h2 className="font-bold">최근 서버 오류</h2>
      {s.recent_errors.length === 0 ? (
        <p className="rounded-[14px] border border-line bg-white p-5 text-sm text-ink-muted">기록된 오류가 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {s.recent_errors.map((e, i) => (
            <li key={i} className="rounded-[14px] border border-line bg-white p-4 text-sm">
              <p className="text-xs text-ink-muted">{time(e.created_at)}</p>
              <p className="break-all font-medium">{e.source}</p>
              <p className="break-all text-ink-muted">{e.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-[14px] border bg-white p-4 ${warn ? "border-danger" : "border-line"}`}>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`text-lg font-bold ${warn ? "text-danger" : ""}`}>{value}</p>
    </div>
  );
}
