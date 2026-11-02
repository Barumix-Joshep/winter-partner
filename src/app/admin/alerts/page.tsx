import { Suspense } from "react";
import Link from "next/link";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isAiEnabled } from "@/lib/ai/flags";
import { ActivityButton } from "./activity-button";

const KIND: Record<string, string> = {
  repeat_cancel: "최근 7일 일방 취소 2회 이상",
  penalty_points: "누적 패널티 5점 이상",
  bids_dropped: "입찰을 받고 선정 없이 내린 공고 30일 3건 이상 (직거래 의심 신호)",
};

// 본사: 규칙 기반 이상 패턴. 신호일 뿐이고 판단·조치는 담당자가 한다.
export default function AlertsPage() {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin" className="text-sm text-ink-muted">
        ‹ 본사 관리
      </Link>
      <h1 className="text-lg font-bold">이상 패턴</h1>
      <p className="text-sm text-ink-muted">규칙으로 찾은 신호입니다. 사실 확인 없이 제재하지 말고, 해당 강사·샵에 먼저 사정을 물어봐 주세요.</p>
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <Alerts />
      </Suspense>
    </div>
  );
}

async function Alerts() {
  await requireArea("admin");
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_anomalies");
  const rows = (data ?? []) as { kind: string; subject_type: string; subject_id: string; subject_name: string; count: number; last_at: string | null }[];
  if (rows.length === 0) return <p className="rounded-[14px] border border-line bg-white p-5 text-sm text-ink-muted">지금은 신호가 없습니다.</p>;
  const ai = await isAiEnabled(null, "admin_query");
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={`${r.kind}-${r.subject_id}`} className="rounded-[14px] border border-line bg-white p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-bold">
              {r.subject_name} <span className="text-xs font-normal text-ink-muted">{r.subject_type === "shop" ? "샵" : "강사"}</span>
            </p>
            <span className="rounded-full bg-[#FFF1E0] px-2.5 py-1 text-xs font-medium text-[#B4560A]">{r.count}</span>
          </div>
          <p className="mt-1 text-sm text-ink-muted">{KIND[r.kind] ?? r.kind}</p>
          {ai && r.subject_type === "instructor" && <ActivityButton id={r.subject_id} />}
        </li>
      ))}
    </ul>
  );
}
