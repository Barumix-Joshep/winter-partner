import { Suspense } from "react";
import Link from "next/link";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { requestTime } from "@/lib/time";
import { aiKeyConfigured } from "@/lib/ai/flags";
import { AI_FEATURE_LABEL, type AiFeature } from "@/lib/ai/types";
import { setAiDefault } from "./actions";

// 본사: AI 기능별 사용량·비용·실패율과 플랫폼 기본값
export default function AdminAiPage() {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin" className="text-sm text-ink-muted">
        ‹ 본사 관리
      </Link>
      <h1 className="text-lg font-bold">AI 사용량</h1>
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <Usage />
      </Suspense>
    </div>
  );
}

type Row = { feature: string; ok: boolean; cost_krw: number };
const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

async function Usage() {
  await requireArea("admin");
  const supabase = await createClient();
  const now = await requestTime();
  const monthStart = new Date(Date.UTC(new Date(now + 9 * 3600_000).getUTCFullYear(), new Date(now + 9 * 3600_000).getUTCMonth(), 1) - 9 * 3600_000).toISOString();
  const [{ data: settings }, { data: rows }] = await Promise.all([
    supabase.rpc("ai_admin_settings"),
    supabase.from("ai_usage").select("feature, ok, cost_krw").gte("created_at", monthStart).limit(10000),
  ]);
  const s = (settings ?? {}) as Record<string, unknown>;
  const defaults = (s.ai_features ?? {}) as Record<string, boolean>;
  const cap = Number(s.ai_monthly_cap_krw ?? 0);
  const spent = Number(s.month_cost_krw ?? 0);
  const by = new Map<string, { calls: number; fails: number; cost: number }>();
  for (const r of (rows ?? []) as Row[]) {
    const v = by.get(r.feature) ?? { calls: 0, fails: 0, cost: 0 };
    v.calls++;
    if (!r.ok) v.fails++;
    v.cost += Number(r.cost_krw);
    by.set(r.feature, v);
  }
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Box label="API 키" value={aiKeyConfigured() ? "설정됨" : "없음 (모든 AI 꺼짐)"} />
        <Box label="이번 달 비용" value={`${won(spent)} / 상한 ${won(cap)}`} warn={spent >= cap} />
        <Box label="모델" value={`${String(s.ai_model_text ?? "")} · ${String(s.ai_model_vision ?? "")}`} />
      </div>
      <div className="overflow-x-auto rounded-[14px] border border-line bg-white">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead className="bg-surface text-xs text-ink-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">기능</th>
              <th className="px-4 py-2.5 font-medium">이번 달 호출</th>
              <th className="px-4 py-2.5 font-medium">실패율</th>
              <th className="px-4 py-2.5 font-medium">비용</th>
              <th className="px-4 py-2.5 font-medium">플랫폼 기본값</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(AI_FEATURE_LABEL) as AiFeature[]).map((f) => {
              const v = by.get(f) ?? { calls: 0, fails: 0, cost: 0 };
              const on = defaults[f] !== false;
              return (
                <tr key={f} className="border-t border-[#EEF1F6]">
                  <td className="px-4 py-2.5">{AI_FEATURE_LABEL[f]}</td>
                  <td className="px-4 py-2.5">{v.calls}</td>
                  <td className="px-4 py-2.5">{v.calls ? `${Math.round((v.fails / v.calls) * 100)}%` : "—"}</td>
                  <td className="px-4 py-2.5">{won(v.cost)}</td>
                  <td className="px-4 py-2.5">
                    <form action={setAiDefault}>
                      <input type="hidden" name="feature" value={f} />
                      <input type="hidden" name="enabled" value={on ? "false" : "true"} />
                      <button aria-label={`${AI_FEATURE_LABEL[f]} ${on ? "끄기" : "켜기"}`} className={`min-h-11 rounded-lg px-3 text-xs font-medium ${on ? "bg-[#E6F4EA] text-[#1B6B3A]" : "bg-[#EEF1F6] text-ink-muted"}`}>
                        {on ? "켜짐" : "꺼짐"}
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-muted">
        단가·상한·샵 하루 호출 수(기본 200회)는 DB 설정(private.app_settings의 ai_*)에서 바꿉니다. 단가는 추정치이니 실제 청구액과 맞춰 갱신해 주세요.
      </p>
    </>
  );
}

function Box({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`mt-1 text-sm font-bold ${warn ? "text-danger" : ""}`}>{value}</p>
    </div>
  );
}
