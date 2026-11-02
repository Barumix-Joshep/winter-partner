import { Suspense } from "react";
import Link from "next/link";
import { requireArea } from "@/lib/auth/session";
import { isAiEnabled } from "@/lib/ai/flags";
import { todayKst } from "@/lib/instructor/schedule";
import { requestTime } from "@/lib/time";
import { AskForm } from "./ask-form";

// 본사 데이터 질의: 정해진 집계 10개 (AI가 켜져 있으면 질문으로 고를 수 있다)
export default function AskPage() {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin" className="text-sm text-ink-muted">
        ‹ 본사 관리
      </Link>
      <h1 className="text-lg font-bold">데이터 보기</h1>
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <Ask />
      </Suspense>
    </div>
  );
}

async function Ask() {
  await requireArea("admin");
  return <AskForm ai={await isAiEnabled(null, "admin_query")} month={todayKst(await requestTime()).slice(0, 7)} />;
}
