import { Suspense } from "react";
import Link from "next/link";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { reviewCert } from "./actions";

export default function AdminHome() {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/access-logs" className="flex min-h-11 items-center self-start text-sm text-brand underline">
        전체 접속 기록 보기
      </Link>
      <Link href="/admin/ai" className="flex min-h-11 items-center self-start text-sm text-brand underline">
        AI 사용량·설정
      </Link>
      <h1 className="text-lg font-bold">자격증 검증</h1>
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <PendingCerts />
      </Suspense>
    </div>
  );
}

type PendingCert = {
  id: string;
  issuer: string;
  grade: string | null;
  file_url: string | null;
  instructors: { profiles: { name: string } | null } | null;
};

async function PendingCerts() {
  await requireArea("admin");
  const supabase = await createClient();
  const { data } = await supabase
    .from("instructor_certs")
    .select("id, issuer, grade, file_url, instructors(profiles(name))")
    .eq("status", "pending");
  const certs = (data ?? []) as unknown as PendingCert[];
  if (certs.length === 0) return <p className="rounded-[14px] border border-line bg-white p-5 text-sm text-ink-muted">확인할 자격증이 없습니다.</p>;

  // 비공개 버킷이라 10분짜리 서명 주소로 연다
  const paths = certs.map((c) => c.file_url).filter((p): p is string => !!p);
  const { data: signed } = await supabase.storage.from("certs").createSignedUrls(paths, 600);
  const urlOf = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {certs.map((c) => {
        const url = c.file_url ? urlOf.get(c.file_url) : undefined;
        return (
          <li key={c.id} className="flex flex-col gap-3 rounded-[14px] border border-line bg-white p-4">
            <div>
              <p className="text-sm font-bold">{c.instructors?.profiles?.name ?? "이름 없음"}</p>
              <p className="text-sm text-ink-muted">
                {c.issuer} {c.grade}
              </p>
            </div>
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-brand underline">
                파일 보기 (10분 동안 열림)
              </a>
            ) : (
              <p className="text-sm text-danger">파일이 없습니다</p>
            )}
            <form action={reviewCert} className="flex gap-2">
              <input type="hidden" name="id" value={c.id} />
              <button name="decision" value="approve" className="min-h-11 flex-1 rounded-[10px] bg-brand text-sm font-medium text-white">
                승인
              </button>
              <button name="decision" value="reject" className="min-h-11 flex-1 rounded-[10px] border border-line text-sm">
                반려
              </button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
