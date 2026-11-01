"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { noticeMessage } from "@/lib/instructor/notice";

// 처리 결과 안내 (?notice=…). 닫으면 주소에서 지운다.
export function NoticeBanner() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const message = noticeMessage(params.get("notice"));
  if (!message) return null;

  const close = () => {
    const rest = new URLSearchParams(params);
    rest.delete("notice");
    const q = rest.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };
  return (
    <p role="status" className="mx-auto mb-4 flex max-w-md items-center justify-between gap-3 rounded-[14px] border border-[#BFD0F7] bg-[#E3EBFF] py-1 pr-1 pl-4 text-sm text-brand">
      <span>{message}</span>
      <button type="button" onClick={close} aria-label="안내 닫기" className="min-h-11 min-w-11 text-ink-muted">
        ×
      </button>
    </p>
  );
}
