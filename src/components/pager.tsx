import Link from "next/link";
import type { pageInfo } from "@/lib/paging";

// "전체 N건 중 a~b" + 이전·다음 쪽. 한 쪽에 다 들어가면 아무것도 그리지 않는다.
export function Pager({ info, href, unit = "건" }: { info: ReturnType<typeof pageInfo>; href: (page: number) => string; unit?: string }) {
  if (!info.truncated) return null;
  return (
    <nav aria-label="쪽 이동" className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-[#FFF1E0] px-3 py-2 text-sm text-[#7A3E06]">
      <span>
        전체 {info.total.toLocaleString("ko-KR")}{unit} 중 {info.from.toLocaleString("ko-KR")}~{info.to.toLocaleString("ko-KR")} ({info.page}/{info.pages}쪽)
      </span>
      <span className="flex gap-1">
        {info.prev && (
          <Link href={href(info.prev)} className="flex min-h-11 items-center px-3 font-medium underline">
            이전 쪽
          </Link>
        )}
        {info.next && (
          <Link href={href(info.next)} className="flex min-h-11 items-center px-3 font-medium underline">
            다음 쪽
          </Link>
        )}
      </span>
    </nav>
  );
}
