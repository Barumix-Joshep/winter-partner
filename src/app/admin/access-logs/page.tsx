import { Suspense } from "react";
import Link from "next/link";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AccessLogTable, type AccessLogRow } from "@/components/access-log-table";

// 본사: 전체 샵 접속 기록 (최근 500건)
export default function AdminAccessLogsPage() {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin" className="text-sm text-ink-muted">
        ‹ 본사 관리
      </Link>
      <h1 className="text-lg font-bold">전체 접속 기록</h1>
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <Logs />
      </Suspense>
    </div>
  );
}

async function Logs() {
  await requireArea("admin");
  const supabase = await createClient();
  const [{ data }, { data: shops }] = await Promise.all([
    supabase.from("access_logs").select("id, shop_id, actor_name, action, target_id, detail, created_at").order("created_at", { ascending: false }).limit(500),
    supabase.from("shops").select("id, name"),
  ]);
  const names = new Map((shops ?? []).map((s) => [s.id as string, s.name as string]));
  return <AccessLogTable rows={(data ?? []) as AccessLogRow[]} shopNames={names} />;
}
