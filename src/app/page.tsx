import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { signOut } from "./login/actions";

const ROLE_LABEL = { platform_admin: "플랫폼 관리자", shop_admin: "샵 관리자", instructor: "강사" } as const;

// 역할별 화면 분기는 P2-2에서 한다. 지금은 로그인 상태만 보여 준다.
export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-navy px-5 pt-14 pb-6 text-white">
        <h1 className="text-xl font-bold">겨울파트너</h1>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-6">
        <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
          <Me />
        </Suspense>
      </main>
    </div>
  );
}

async function Me() {
  const user = await getCurrentUser();
  return (
    <section className="rounded-[14px] border border-line bg-white p-5">
      <p className="text-lg font-bold">{user.name ?? user.email}님</p>
      <p className="mt-1 text-sm text-ink-muted">
        {user.role ? ROLE_LABEL[user.role] : "역할을 아직 고르지 않았습니다"} · {user.email}
      </p>
      <form action={signOut} className="mt-4">
        <button className="min-h-11 w-full rounded-[10px] border border-line text-sm font-medium">로그아웃</button>
      </form>
    </section>
  );
}
