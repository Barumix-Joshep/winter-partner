import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { homePathFor } from "@/lib/auth/routing";

// 로그인한 사용자를 역할별 첫 화면으로 보낸다
export default function Home() {
  return (
    <Suspense fallback={<p className="p-5 text-sm text-ink-muted">불러오는 중…</p>}>
      <RedirectHome />
    </Suspense>
  );
}

async function RedirectHome() {
  const user = await getCurrentUser();
  redirect(homePathFor(user));
  return null;
}
