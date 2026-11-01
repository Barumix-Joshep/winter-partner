"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type NavItem = { href: string; label: string; icon?: ReactNode };

// 구역 첫 화면(/shop, /instructor)은 그 주소일 때만, 나머지는 하위 경로까지 현재 메뉴로 본다
export function isActive(pathname: string, href: string, root: string) {
  return href === root ? pathname === root : pathname === href || pathname.startsWith(`${href}/`);
}

// 샵 사이드바 (프로토타입 Main: 현재 메뉴는 파랑 바탕)
export function SideNav({ items, root }: { items: NavItem[]; root: string }) {
  const pathname = usePathname();
  return (
    <>
      {items.map((n) => {
        const on = isActive(pathname, n.href, root);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={on ? "page" : undefined}
            className={`flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm ${
              on ? "bg-brand font-medium text-white" : "text-[#C9D4EA] hover:bg-navy-2 hover:text-white"
            }`}
          >
            {n.label}
          </Link>
        );
      })}
    </>
  );
}

// 강사 하단 탭 (프로토타입 IHome: 흰 바탕, 현재 탭은 파랑)
export function TabBar({ items, root }: { items: NavItem[]; root: string }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="강사 메뉴"
      className="fixed inset-x-0 bottom-0 z-10 grid border-t border-line bg-white pb-[env(safe-area-inset-bottom,0px)]"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((n) => {
        const on = isActive(pathname, n.href, root);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={on ? "page" : undefined}
            className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] ${on ? "font-medium text-brand" : "text-ink-muted"}`}
          >
            {n.icon}
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
