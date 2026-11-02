"use client";

import { useTransition } from "react";
import { signOutSession } from "@/app/login/actions";

// 로그아웃 뒤 뒤로 가기로 지난 화면(손님 연락처 등)이 다시 보이지 않게, 세션을 끊고 화면을 통째로 새로 불러온다.
// 앱 안 이동(redirect)은 이전 화면을 메모리에 남겨 둔다 (P18-4). 기록도 replace로 덮어쓴다.
export function LogoutButton({ className }: { className: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={className}
      onClick={() =>
        start(async () => {
          await signOutSession();
          window.location.replace("/login");
        })
      }
    >
      로그아웃
    </button>
  );
}
