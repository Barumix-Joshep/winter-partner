import type { ReactNode } from "react";
import Link from "next/link";

// 약관·처리방침 공통 틀. 문구는 초안이며 출시 전 법률 검토가 필요하다.
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-navy px-5 pt-14 pb-6 text-white">
        <Link href="/" className="text-xs text-navy-muted">겨울파트너</Link>
        <h1 className="mt-1 text-2xl font-bold">{title}</h1>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-6">
        <p className="mb-5 rounded-[10px] border border-[#F3D4A8] bg-[#FFF1E0] p-3 text-sm text-[#7A3E06]">
          초안입니다. 정식 출시 전에 법률 검토를 거쳐 바뀔 수 있습니다. 시행일 {updated}
        </p>
        <article className="flex flex-col gap-5 text-sm leading-7 [&_h2]:text-base [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc">{children}</article>
      </main>
    </div>
  );
}
