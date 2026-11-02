import { Suspense } from "react";
import Link from "next/link";
import { requireArea } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { reviewCert } from "./actions";
import { compareCert, parseCertExtract } from "@/lib/ai/cert";
import { todayKst } from "@/lib/instructor/schedule";
import { requestTime } from "@/lib/time";

export default function AdminHome() {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/access-logs" className="flex min-h-11 items-center self-start text-sm text-brand underline">
        전체 접속 기록 보기
      </Link>
      <Link href="/admin/ai" className="flex min-h-11 items-center self-start text-sm text-brand underline">
        AI 사용량·설정
      </Link>
      <Link href="/admin/pilot" className="flex min-h-11 items-center self-start text-sm text-brand underline">
        시범 운영 지표
      </Link>
      <Link href="/admin/feedback" className="flex min-h-11 items-center self-start text-sm text-brand underline">
        받은 의견
      </Link>
      <Link href="/admin/ops" className="flex min-h-11 items-center self-start text-sm text-brand underline">
        운영 상태 (오류·크론)
      </Link>
      <Link href="/admin/alerts" className="flex min-h-11 items-center self-start text-sm text-brand underline">
        이상 패턴
      </Link>
      <Link href="/admin/ask" className="flex min-h-11 items-center self-start text-sm text-brand underline">
        데이터 보기
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
  ai_extract: unknown;
  instructors: { profiles: { name: string } | null } | null;
};

async function PendingCerts() {
  await requireArea("admin");
  const supabase = await createClient();
  const { data } = await supabase
    .from("instructor_certs")
    .select("id, issuer, grade, file_url, ai_extract, instructors(profiles(name))")
    .eq("status", "pending");
  const certs = (data ?? []) as unknown as PendingCert[];
  if (certs.length === 0) return <p className="rounded-[14px] border border-line bg-white p-5 text-sm text-ink-muted">확인할 자격증이 없습니다.</p>;

  // 비공개 버킷이라 10분짜리 서명 주소로 연다
  const paths = certs.map((c) => c.file_url).filter((p): p is string => !!p);
  const { data: signed } = await supabase.storage.from("certs").createSignedUrls(paths, 600);
  const urlOf = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const today = todayKst(await requestTime());

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
            <AiCompare cert={c} today={today} />
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

// AI 판독값과 강사 입력값 비교 (참고용, 승인은 사람이). 불일치는 빨강, 성명 불일치·만료는 "확인 필요".
function AiCompare({ cert, today }: { cert: PendingCert; today: string }) {
  const ex = parseCertExtract(cert.ai_extract);
  if (!ex) return null;
  const { checks, needsReview } = compareCert({ issuer: cert.issuer, grade: cert.grade, profileName: cert.instructors?.profiles?.name ?? "" }, ex, today);
  return (
    <div className="rounded-lg border border-line">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <p className="text-xs font-medium text-ink-muted">AI 판독 (참고용)</p>
        {needsReview && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-danger">확인 필요</span>}
      </div>
      <table className="w-full text-left text-xs">
        <thead className="text-ink-muted">
          <tr>
            <th className="px-3 py-1.5 font-medium">항목</th>
            <th className="px-3 py-1.5 font-medium">강사 입력·프로필</th>
            <th className="px-3 py-1.5 font-medium">판독값</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((k) => (
            <tr key={k.field} className={k.ok ? "" : "bg-red-50 text-danger"}>
              <td className="px-3 py-1.5">{k.label}</td>
              <td className="px-3 py-1.5">{k.entered ?? "—"}</td>
              <td className="px-3 py-1.5">{k.read ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!ex.readable && <p className="px-3 py-2 text-xs text-danger">이미지를 읽지 못했습니다. 파일을 직접 확인해 주세요.</p>}
    </div>
  );
}
