import { Suspense } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { homePathFor } from "@/lib/auth/routing";
import { createClient } from "@/lib/supabase/server";
import { notificationMessage } from "@/lib/notify/messages";
import { PushToggle } from "./push-toggle";
import { markAllRead } from "./actions";

export default function NotificationsPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-navy px-5 pt-14 pb-5 text-white">
        <h1 className="text-xl font-bold">알림</h1>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-5 py-6">
        <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
          <List />
        </Suspense>
      </main>
    </div>
  );
}

type Row = { id: string; kind: string; payload: Record<string, unknown>; created_at: string; read_at: string | null };

async function List() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("id, kind, payload, created_at, read_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
  const rows = (data ?? []) as Row[];
  const jobIds = [...new Set(rows.map((r) => r.payload.job_id).filter((v): v is string => typeof v === "string"))];
  // RLS: 엮인 강습만 보인다
  const { data: jobs } = jobIds.length
    ? await supabase.from("jobs").select("id, starts_at, ends_at, shops(name)").in("id", jobIds)
    : { data: [] };
  const jobMap = new Map(
    ((jobs ?? []) as unknown as { id: string; starts_at: string; ends_at: string; shops: { name: string } | null }[]).map((j) => [
      j.id,
      { starts_at: j.starts_at, ends_at: j.ends_at, shop: j.shops?.name ?? null },
    ]),
  );
  const unread = rows.filter((r) => !r.read_at).length;

  return (
    <>
      <Link href={homePathFor(user)} className="text-sm text-ink-muted">‹ 돌아가기</Link>
      <PushToggle />
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">읽지 않은 알림 {unread}개</p>
        {unread > 0 && (
          <form action={markAllRead}>
            <button className="min-h-11 px-2 text-sm text-ink-muted">모두 읽음</button>
          </form>
        )}
      </div>
      {rows.length === 0 && <p className="text-sm text-ink-muted">알림이 없습니다.</p>}
      <ul className="flex flex-col gap-2">
        {rows.map((r) => {
          const m = notificationMessage(r.kind, r.payload, jobMap.get(r.payload.job_id as string) ?? null);
          return (
            <li key={r.id}>
              <Link href={m.url} className={`block rounded-[14px] border p-4 ${r.read_at ? "border-line bg-white" : "border-[#BFD0FF] bg-[#E3EBFF]"}`}>
                <p className="text-sm font-bold">{m.title}</p>
                {m.body && <p className="mt-0.5 text-xs text-ink-muted">{m.body}</p>}
                <p className="mt-1 text-[11px] text-ink-muted">{new Date(r.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
