import { Suspense, type ReactNode } from "react";
import { requireArea } from "@/lib/auth/session";
import type { Area } from "@/lib/auth/routing";
import { signOut } from "@/app/login/actions";

const TITLE: Record<Area, string> = { admin: "본사 관리", shop: "샵 관리", instructor: "강사" };

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
  return (
    <>
      <header className="bg-navy px-5 pt-14 pb-5 text-white">
        <div className="mx-auto flex w-full max-w-5xl items-end justify-between gap-3">
          <div>
            <p className="text-xs text-navy-muted">겨울파트너 · {TITLE[area]}</p>
            <p className="mt-0.5 text-xl font-bold">{user.name ?? user.email}님</p>
          </div>
          <form action={signOut}>
            <button className="min-h-11 rounded-[10px] bg-navy-2 px-4 text-sm">로그아웃</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-6">{children}</main>
    </>
  );
}
