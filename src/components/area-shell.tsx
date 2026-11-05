import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { requireArea } from "@/lib/auth/session";
import type { Area } from "@/lib/auth/routing";
import { recordAgreement } from "@/app/login/actions";
import { LogoutButton } from "./logout-button";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shop/my-shop";
import { SideNav, TabBar, type NavItem } from "./nav-links";

const TITLE: Record<Area, string> = { admin: "본사 관리", shop: "샵 관리", instructor: "강사" };

const icon = (d: ReactNode) => (
  <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    {d}
  </svg>
);

// 구역별 메뉴. 샵은 데스크톱에서 왼쪽 사이드바, 모바일에서 상단 탭 (프로토타입 Main). 강사는 하단 탭 (프로토타입 IHome)
const NAV: Partial<Record<Area, NavItem[]>> = {
  shop: [
    { href: "/shop", label: "오늘 일정" },
    { href: "/shop/instructors", label: "강사 찾기" },
    { href: "/shop/jobs", label: "강습 등록·입찰" },
    { href: "/shop/customers", label: "손님" },
    { href: "/shop/team", label: "전속 강사" },
    { href: "/shop/settlements", label: "정산" },
    { href: "/shop/access-logs", label: "접속 기록" },
  ],
  instructor: [
    { href: "/instructor", label: "홈", icon: icon(<path d="M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1z" />) },
    { href: "/instructor/bids", label: "공고", icon: icon(<path d="M4 4h16v16H4zM8 9h8M8 13h5" />) },
    {
      href: "/instructor/schedule",
      label: "일정",
      icon: icon(
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </>,
      ),
    },
    {
      href: "/instructor/pay",
      label: "정산",
      icon: icon(
        <>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <circle cx="12" cy="12" r="2.5" />
        </>,
      ),
    },
  ],
};

// 프로토타입 로고 (파랑 사각형에 스키 자국)
function Logo() {
  return (
    <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-brand">
      <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round">
        <path d="M4 18L20 6M8 20l10-14" />
      </svg>
    </span>
  );
}

function Bell({ unread, className = "" }: { unread: number; className?: string }) {
  return (
    <Link
      href="/notifications"
      aria-label={`알림${unread ? ` ${unread}개 읽지 않음` : ""}`}
      className={`relative flex size-11 items-center justify-center rounded-full bg-navy-2 ${className}`}
    >
      <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />
      </svg>
      {!!unread && <span className="absolute top-2 right-2 size-2.5 rounded-full bg-[#F2994A]" />}
    </Link>
  );
}

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
  const supabase = await createClient();
  const [{ count }, shop] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
    area === "shop" ? getMyShop(user.id) : Promise.resolve(null),
  ]);
  const unread = count ?? 0;
  const agreement = !user.termsAgreed && (
    <form action={recordAgreement} className="mb-4 flex print:hidden flex-wrap items-center gap-3 rounded-[14px] border border-[#BFD0FF] bg-[#E3EBFF] p-4 text-sm text-brand-dark">
      <span className="min-w-0 flex-1">
        <a href="/terms" target="_blank" className="underline">이용약관</a>과{" "}
        <a href="/privacy" target="_blank" className="underline">개인정보 처리방침</a>에 동의해 주세요.
      </span>
      <button className="min-h-11 rounded-[10px] bg-brand px-4 font-medium text-white">동의합니다</button>
    </form>
  );

  // 강사: 모바일 전용. 상단 인사 + 하단 탭
  if (area === "instructor") {
    return (
      <div className="flex flex-1 flex-col">
        <header className="bg-navy px-5 pt-14 pb-5 text-white">
          <div className="mx-auto flex max-w-md items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-navy-muted">겨울파트너 · {TITLE[area]}</p>
              <p className="mt-0.5 truncate text-xl font-bold">{user.name ?? user.email} 강사님</p>
            </div>
            <div className="flex gap-2">
              <Link href="/instructor/profile" aria-label="내 프로필" className="flex size-11 items-center justify-center rounded-full bg-navy-2">
                <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
                </svg>
              </Link>
              <Bell unread={unread} />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-5 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]">
          {agreement}
          {children}
          <div className="mt-10 flex flex-wrap gap-4 print:hidden">
            <Link href="/help?for=instructor" className="flex min-h-11 items-center text-sm text-ink-muted underline">
              사용 안내
            </Link>
          </div>
        </main>
        <TabBar items={NAV.instructor!} root="/instructor" />
      </div>
    );
  }

  const nav = NAV[area];
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <header className="flex flex-col bg-navy px-5 pt-14 pb-5 text-white md:w-[220px] md:shrink-0 md:px-4 md:pt-6 print:hidden">
        <div className="flex items-end justify-between gap-3 md:flex-col md:items-stretch">
          <div className="flex items-center gap-2.5 md:px-2 md:pb-2">
            <Logo />
            <div className="min-w-0">
              <p className="truncate text-xl font-bold md:text-[15px]">{shop?.name ?? user.name ?? user.email}</p>
              <p className="text-xs text-navy-muted">
                {shop ? (shop.type === "lesson_team" ? "강습팀 관리자" : "렌탈샵 관리자") : `겨울파트너 · ${TITLE[area]}`}
                {shop && user.name ? ` · ${user.name}님` : ""}
              </p>
            </div>
          </div>
          <Bell unread={unread} className="md:hidden" />
        </div>
        {nav && (
          <nav aria-label="샵 메뉴" className="mt-4 flex flex-wrap gap-1 md:mt-4 md:flex-col md:flex-nowrap">
            <SideNav
              items={shop?.type === "lesson_team" ? [...nav.slice(0, 3), { href: "/shop/team-bids", label: "팀 입찰" }, ...nav.slice(3)] : nav}
              root="/shop"
            />
            <Link href="/notifications" className="hidden min-h-11 shrink-0 items-center justify-between rounded-lg px-3 text-sm text-[#C9D4EA] hover:bg-navy-2 hover:text-white md:flex">
              알림 {!!unread && <span className="rounded-full bg-[#F2994A] px-2 text-xs text-white">{unread}</span>}
            </Link>
          </nav>
        )}
        <div className="mt-auto hidden flex-col gap-3 pt-6 md:flex">
          {shop && shop.resorts.length > 0 && (
            <p className="rounded-[10px] bg-navy-2 p-3 text-xs leading-relaxed text-navy-muted">
              영업 스키장
              <br />
              <span className="font-medium text-white">{shop.resorts.map((r) => r.name).join(" · ")}</span>
            </p>
          )}
          {shop && (
            <Link href="/shop/settings" className="flex min-h-11 items-center rounded-lg px-3 text-sm text-[#C9D4EA] hover:bg-navy-2 hover:text-white">
              샵 정보
            </Link>
          )}
          {shop && (
            <Link href="/shop/ai" className="flex min-h-11 items-center rounded-lg px-3 text-sm text-[#C9D4EA] hover:bg-navy-2 hover:text-white">
              AI 도우미 설정
            </Link>
          )}
          {shop && (
            <Link href="/shop/ai-consult/knowledge" className="flex min-h-11 items-center rounded-lg px-3 text-sm text-[#C9D4EA] hover:bg-navy-2 hover:text-white">
              AI 상담 안내 정보
            </Link>
          )}
          <Link href="/help?for=shop" className="flex min-h-11 items-center rounded-lg px-3 text-sm text-[#C9D4EA] hover:bg-navy-2 hover:text-white">
            사용 안내
          </Link>
          <LogoutButton className="min-h-11 w-full rounded-[10px] bg-navy-2 px-4 text-sm" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-6 md:px-8">
        {agreement}
        {children}
        <div className="mt-10 flex flex-wrap gap-4 md:hidden print:hidden">
          {shop && (
            <Link href="/shop/settings" className="flex min-h-11 items-center text-sm text-ink-muted underline">
              샵 정보
            </Link>
          )}
          <Link href="/help?for=shop" className="flex min-h-11 items-center text-sm text-ink-muted underline">
            사용 안내
          </Link>
          {shop && (
            <Link href="/shop/ai" className="flex min-h-11 items-center text-sm text-ink-muted underline">
              AI 도우미 설정
            </Link>
          )}
          {shop && (
            <Link href="/shop/ai-consult/knowledge" className="flex min-h-11 items-center text-sm text-ink-muted underline">
              AI 상담 안내 정보
            </Link>
          )}
          <LogoutButton className="min-h-11 text-sm text-ink-muted underline" />
        </div>
      </main>
    </div>
  );
}
