import { createClient } from "@/lib/supabase/server";
import { deleteCert } from "./cert-actions";
import { CertUploadForm } from "./cert-upload-form";

const STATUS = {
  pending: { label: "확인 중", cls: "bg-[#FFF1E0] text-[#B4560A]" },
  approved: { label: "검증됨", cls: "bg-[#E3EBFF] text-brand" },
  rejected: { label: "반려", cls: "bg-red-50 text-danger" },
} as const;

// 내 자격증 목록과 업로드 (RLS: 본인 것만 모두 보인다)
export async function Certs({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { data: inst } = await supabase.from("instructors").select("id").eq("user_id", userId).maybeSingle();
  const { data: certs } = await supabase
    .from("instructor_certs")
    .select("id, issuer, grade, status")
    .eq("instructor_id", inst?.id ?? "")
    .order("verified_at", { ascending: false, nullsFirst: true });

  return (
    <section className="mt-6">
      <h2 className="text-base font-bold">자격증</h2>
      <p className="mt-1 text-sm text-ink-muted">본사가 확인한 자격증만 샵에 보입니다. 파일은 본사만 봅니다.</p>
      <ul className="mt-3 flex flex-col gap-2">
        {(certs ?? []).map((c) => {
          const s = STATUS[c.status as keyof typeof STATUS];
          return (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-[14px] border border-line bg-white p-4">
              <div>
                <p className="text-sm font-bold">
                  {c.issuer} {c.grade}
                </p>
                <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>
              </div>
              <form action={deleteCert}>
                <input type="hidden" name="id" value={c.id} />
                <button className="min-h-11 px-3 text-sm text-ink-muted">삭제</button>
              </form>
            </li>
          );
        })}
      </ul>
      <CertUploadForm />
    </section>
  );
}
