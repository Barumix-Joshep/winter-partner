import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { requestTime } from "@/lib/time";
import { capUse, kstMonthRange, monthLabel, parseMonth, recentMonths, summarize, type MetricsRow } from "@/lib/ai/consult/metrics";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type ShopCost = { shop_id: string; calls: number; failed: number; cost_krw: number; max_day_calls: number; cap_days: number; daily_cap: number };

const won = (n: number) => `${Math.round(Number(n)).toLocaleString("ko-KR")}원`;

// 본사: AI 상담 지표 (P22-7). 본사는 상담 표를 못 읽으므로 숫자만 돌려주는 DB 함수로 집계한다(손님 글·연락처 없음).
export async function ConsultMetrics({ searchParams }: { searchParams: SearchParams }) {
  await requireArea("admin");
  const now = await requestTime();
  const month = parseMonth((await searchParams).month, now);
  const { from, to } = kstMonthRange(month);
  const supabase = await createClient();
  const [metrics, costs] = await Promise.all([
    supabase.rpc("consult_admin_metrics", { p_from: from, p_to: to }),
    supabase.rpc("consult_admin_shop_costs", { p_from: from, p_to: to }),
  ]);
  if (metrics.error || costs.error) {
    return <p className="rounded-xl border border-line bg-white p-4 text-sm text-ink-muted">AI 상담 지표를 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.</p>;
  }
  const s = summarize(((metrics.data ?? []) as MetricsRow[])[0]);
  const shops = (costs.data ?? []) as ShopCost[];
  const { data: names } = shops.length
    ? await supabase.from("shops").select("id, name").in("id", shops.map((r) => r.shop_id))
    : { data: [] };
  const nameOf = new Map(((names ?? []) as { id: string; name: string }[]).map((n) => [n.id, n.name]));

  return (
    <section aria-label="AI 상담 지표" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-base font-bold">AI 상담 지표 · {monthLabel(month)}</h2>
        <form method="get" className="flex items-center gap-2">
          <label htmlFor="consult-month" className="text-xs text-ink-muted">
            기간
          </label>
          <select id="consult-month" name="month" defaultValue={month} className="min-h-11 rounded-lg border border-line bg-white px-2 text-sm">
            {recentMonths(now, 12).map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <button className="min-h-11 rounded-lg bg-brand px-3 text-sm font-medium text-white">보기</button>
        </form>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="자동응답률" value={s.autoRate} detail={s.autoDetail} />
        <Card label="에스컬레이션률" value={s.escalationRate} detail={s.escalationDetail} />
        <Card label="평균 첫 응답 시간" value={s.firstReplyAvg} detail={`중앙값 ${s.firstReplyMedian} · ${s.firstReplyDetail}`} />
        <Card label="틀림 피드백" value={`${s.wrong}건`} detail={`고친 답 ${s.edited}건`} />
      </div>
      <div className="overflow-x-auto rounded-[14px] border border-line bg-white">
        <table className="w-full min-w-[30rem] text-left text-sm">
          <caption className="px-4 pt-3 text-left text-sm font-bold">샵별 AI 상담 비용</caption>
          <thead className="bg-surface text-xs text-ink-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">샵</th>
              <th className="px-4 py-2.5 font-medium">호출(실패)</th>
              <th className="px-4 py-2.5 font-medium">비용</th>
              <th className="px-4 py-2.5 font-medium">하루 최대 / 상한</th>
            </tr>
          </thead>
          <tbody>
            {shops.length === 0 ? (
              <tr className="border-t border-[#EEF1F6]">
                <td colSpan={4} className="px-4 py-2.5 text-ink-muted">
                  이 기간 AI 상담 호출이 없습니다.
                </td>
              </tr>
            ) : (
              shops.map((r) => (
                <tr key={r.shop_id} className="border-t border-[#EEF1F6]">
                  <td className="px-4 py-2.5">{nameOf.get(r.shop_id) ?? "(이름 없음)"}</td>
                  <td className="px-4 py-2.5">
                    {r.calls}회{r.failed ? ` (${r.failed})` : ""}
                  </td>
                  <td className="px-4 py-2.5">{won(r.cost_krw)}</td>
                  <td className={`px-4 py-2.5 ${r.cap_days ? "text-danger" : ""}`}>
                    {capUse(r.max_day_calls, r.daily_cap)}
                    {r.cap_days ? ` · 상한 도달 ${r.cap_days}일` : ""}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-ink-muted">
        <li>기간은 한국 시간 기준 그 달 1일 0시부터 다음 달 1일 0시 전까지입니다.</li>
        <li>자동응답률: 손님 메시지 중 바로 다음 답이 AI 자동응답으로 보내진 비율입니다. 사장님 연결 안내나 보내지 못한 답은 빠집니다.</li>
        <li>에스컬레이션률: 손님 메시지가 있었던 대화 중 사장님 확인 문의가 열린 대화의 비율입니다(AI가 넘김·연락처 받음·요청 제한 포함, 대화당 1번).</li>
        <li>첫 응답 시간: 대화마다 그 달 첫 손님 메시지부터 첫 AI 자동응답 또는 사장님 답장까지입니다. 응답이 없는 대화는 빠집니다.</li>
        <li>손님 메시지 내용·연락처는 본사 화면에 나오지 않습니다(숫자 집계만).</li>
      </ul>
    </section>
  );
}

function Card({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-ink-muted">{detail}</p>
    </div>
  );
}
