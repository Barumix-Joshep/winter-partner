import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { GUIDES } from "@/lib/help/guides";

export const metadata: Metadata = { title: "사용 안내 · 겨울파트너" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// 사용 안내 (P16-5). 로그인 없이도 볼 수 있다. 그림은 [테스트] 데이터.
export default function HelpPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p className="p-5 text-sm text-ink-muted">불러오는 중…</p>}>
      <Help searchParams={searchParams} />
    </Suspense>
  );
}

async function Help({ searchParams }: { searchParams: SearchParams }) {
  const key = (await searchParams).for === "instructor" ? "instructor" : "shop";
  const guide = GUIDES.find((g) => g.key === key)!;
  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-navy px-5 pt-14 pb-6 text-white">
        <div className="mx-auto max-w-2xl">
          <p className="text-xs text-navy-muted">겨울파트너</p>
          <h1 className="mt-1 text-2xl font-bold">사용 안내</h1>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-5 py-6">
        <nav aria-label="누구용" className="grid grid-cols-2 gap-1 rounded-[10px] bg-surface p-1">
          {GUIDES.map((g) => (
            <Link
              key={g.key}
              href={`/help?for=${g.key}`}
              aria-current={g.key === key ? "page" : undefined}
              className={`flex min-h-11 items-center justify-center rounded-lg text-sm font-medium ${g.key === key ? "bg-white shadow-sm" : "text-ink-muted"}`}
            >
              {g.title}
            </Link>
          ))}
        </nav>
        <p className="text-sm leading-6">{guide.intro}</p>
        <ol className="flex flex-col gap-4">
          {guide.tasks.map((t, i) => (
            <li key={t.title} className="rounded-[14px] border border-line bg-white p-5">
              <h2 className="font-bold">
                {i + 1}. {t.title}
              </h2>
              <div className="mt-3 flex flex-col gap-4 sm:flex-row">
                <ul className="flex flex-1 list-disc flex-col gap-1.5 pl-5 text-sm leading-6">
                  {t.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
                <Image src={t.image} alt={t.alt} width={390} height={760} className="h-auto w-full max-w-[220px] self-center rounded-[10px] border border-line" />
              </div>
            </li>
          ))}
        </ol>
        <p className="rounded-[14px] bg-blue-50 p-4 text-sm leading-6">
          <strong>알림 켜기</strong> — {guide.tip}
        </p>
        <p className="text-xs text-ink-muted">그림은 [테스트] 데이터로 만든 화면입니다. 궁금한 점은 화면 아래 &lsquo;의견 보내기&rsquo;로 알려 주세요.</p>
        <Link href="/" className="flex min-h-11 items-center self-start text-sm text-brand underline">
          처음 화면으로
        </Link>
      </main>
    </div>
  );
}
