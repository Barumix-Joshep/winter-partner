import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { requireArea } from "@/lib/auth/session";
import type { Area } from "@/lib/auth/routing";
import { signOut } from "@/app/login/actions";

const TITLE: Record<Area, string> = { admin: "본사 관리", shop: "샵 관리", instructor: "강사" };

// 구역별 메뉴. 샵은 데스크톱에서 왼쪽 사이드바, 모바일에서 상단 탭 (프로토타입 Main)
const NAV: Partial<Record<Area, { href: string; label: string }[]>> = {
  shop: [
    { href: "/shop", label: "오늘 일정" },
    { href: "/shop/instructors", label: "강사 찾기" },
    { href: "/shop/jobs", label: "강습 등록·입찰" },
    { href: "/shop/team", label: "전속 강사" },
    { href: "/shop/settlements", label: "정산" },
  ],
  instructor: [
    { href: "/instructor", label: "홈" },
    { href: "/instructor/bids", label: "공고" },
    { href: "/instructor/schedule", label: "일정" },
    { href: "/instructor/pay", label: "정산" },
    { href: "/instructor/profile", label: "프로필" },
  ],
};

// 구역 레이아웃: 역할 가드 + 상단 바. 세션을 읽으므로 Suspense 안에 둔다.
export function AreaShell({ area, children }: { area: Area; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <Suspense fallback={<header className="h-24 bg-navy" />}>
        <Guarded area={area}>{children}</Guarded>
      </Suspense>
    </div>
  );
}

async function Guarded({ area, children }: { area: Area; children: ReactNode }) {
  const user = await requireArea(area);
  const nav = NAV[area];
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <header className="bg-navy px-5 pt-14 pb-5 text-white md:w-56 md:shrink-0 md:px-4 md:pt-6">
        <div className="flex items-end justify-between gap-3 md:flex-col md:items-stretch">
          <div className="md:px-2">
            <p className="text-xs text-navy-muted">겨울파트너 · {TITLE[area]}</p>
            <p className="mt-0.5 text-xl font-bold md:text-base">{user.name ?? user.email}님</p>
          </div>
          <form action={signOut} className="md:order-last md:mt-6">
            <button className="min-h-11 rounded-[10px] bg-navy-2 px-4 text-sm md:w-full">로그아웃</button>
          </form>
        </div>
        {nav && (
          <nav className="-mx-5 mt-4 flex gap-1 overflow-x-auto px-5 md:mx-0 md:mt-6 md:flex-col md:px-0">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm text-[#C9D4EA] hover:bg-navy-2 hover:text-white"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-6 md:px-8">{children}</main>
    </div>
  );
}
