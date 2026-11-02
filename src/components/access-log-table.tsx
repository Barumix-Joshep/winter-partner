import { ACCESS_LABEL, type AccessAction } from "@/lib/audit";

export type AccessLogRow = {
  id: number;
  shop_id: string;
  actor_name: string | null;
  action: AccessAction;
  target_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
};

const when = (iso: string) => new Date(Date.parse(iso) + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ");

// 접속 기록 표 (샵: 자기 샵만, 본사: 전체). 기록은 고치거나 지울 수 없다.
export function AccessLogTable({ rows, shopNames }: { rows: AccessLogRow[]; shopNames?: Map<string, string> }) {
  if (rows.length === 0) return <p className="rounded-[14px] border border-line bg-white p-5 text-sm text-ink-muted">기록이 없습니다.</p>;
  return (
    <div className="overflow-x-auto rounded-[14px] border border-line bg-white">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead className="bg-surface text-xs text-ink-muted">
          <tr>
            <th className="px-4 py-2.5 font-medium">시각</th>
            {shopNames && <th className="px-4 py-2.5 font-medium">샵</th>}
            <th className="px-4 py-2.5 font-medium">누가</th>
            <th className="px-4 py-2.5 font-medium">무엇을</th>
            <th className="px-4 py-2.5 font-medium">대상</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-[#EEF1F6]">
              <td className="px-4 py-2.5 whitespace-nowrap">{when(r.created_at)}</td>
              {shopNames && <td className="px-4 py-2.5">{shopNames.get(r.shop_id) ?? "—"}</td>}
              <td className="px-4 py-2.5">{r.actor_name ?? "—"}</td>
              <td className="px-4 py-2.5">{ACCESS_LABEL[r.action]}</td>
              <td className="px-4 py-2.5 text-xs text-ink-muted">
                {typeof r.detail.month === "string" ? `${r.detail.month}` : r.target_id ? r.target_id.slice(0, 8) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
