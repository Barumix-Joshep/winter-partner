import { Suspense } from "react";
import Link from "next/link";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { updateFeedback } from "./actions";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Row = { id: number; role: string | null; page_path: string; body: string; contact: string | null; status: string; admin_note: string | null; created_at: string };

const STATUS: Record<string, string> = { new: "새 의견", in_progress: "확인 중", done: "처리 끝" };
const ROLE: Record<string, string> = { shop_admin: "샵 관리자", instructor: "강사", platform_admin: "본사" };
const time = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

// 본사: 받은 의견 목록·상태 관리 (P16-6)
export default function FeedbackPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin" className="text-sm text-ink-muted">
        ‹ 본사 관리
      </Link>
      <h1 className="text-lg font-bold">받은 의견</h1>
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <List searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function List({ searchParams }: { searchParams: SearchParams }) {
  await requireArea("admin");
  const q = (await searchParams).status;
  const filter = typeof q === "string" && q in STATUS ? q : "open";
  const supabase = await createClient();
  let query = supabase.from("feedback").select("id, role, page_path, body, contact, status, admin_note, created_at").order("created_at", { ascending: false }).limit(200);
  query = filter === "open" ? query.neq("status", "done") : query.eq("status", filter);
  const { data } = await query;
  const rows = (data ?? []) as Row[];
  const tabs: [string, string][] = [["open", "처리 전"], ["new", "새 의견"], ["in_progress", "확인 중"], ["done", "처리 끝"]];
  return (
    <>
      <nav className="flex flex-wrap gap-2">
        {tabs.map(([k, label]) => (
          <Link
            key={k}
            href={`/admin/feedback?status=${k}`}
            aria-current={filter === k ? "page" : undefined}
            className={`flex min-h-11 items-center rounded-full border px-4 text-sm ${filter === k ? "border-brand bg-blue-50 text-brand" : "border-line"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p className="rounded-[14px] border border-line bg-white p-5 text-sm text-ink-muted">의견이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-[14px] border border-line bg-white p-4 text-sm">
              <p className="text-xs text-ink-muted">
                {time(r.created_at)} · {r.role ? ROLE[r.role] ?? r.role : "로그인 안 함"} · <span className="break-all">{r.page_path}</span>
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words">{r.body}</p>
              {r.contact && <p className="mt-1 text-xs text-ink-muted">답변 연락처: {r.contact}</p>}
              <form action={updateFeedback} className="mt-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={r.id} />
                <label className="text-xs">
                  상태
                  <select name="status" defaultValue={r.status} className="mt-1 block min-h-11 rounded-[10px] border border-line bg-white px-2 text-sm">
                    {Object.entries(STATUS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="min-w-0 flex-1 text-xs">
                  메모
                  <input name="note" defaultValue={r.admin_note ?? ""} maxLength={500} className="mt-1 block min-h-11 w-full rounded-[10px] border border-line px-2 text-sm" />
                </label>
                <button className="min-h-11 rounded-[10px] border border-brand px-4 text-sm text-brand">저장</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
