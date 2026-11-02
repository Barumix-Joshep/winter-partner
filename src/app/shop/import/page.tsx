import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/session";
import { getMyShop } from "@/lib/shop/my-shop";
import { ImportForm } from "./import-form";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// 손님·강사 CSV 일괄 등록 (P16-4): 양식 → 올리기 → 오류 행 미리보기 → 등록
export default function ImportPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
      <Import searchParams={searchParams} />
    </Suspense>
  );
}

async function Import({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireArea("shop");
  if (!(await getMyShop(user.id))) redirect("/shop/new");
  const type = (await searchParams).type === "instructors" ? "instructors" : "customers";
  const tab = (t: typeof type, label: string) => (
    <Link
      href={`/shop/import?type=${t}`}
      aria-current={type === t ? "page" : undefined}
      className={`flex min-h-10 items-center justify-center rounded-lg text-sm font-medium ${type === t ? "bg-white shadow-sm" : "text-ink-muted"}`}
    >
      {label}
    </Link>
  );
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-lg font-bold">한꺼번에 등록</h1>
      <nav className="grid grid-cols-2 gap-1 rounded-[10px] bg-surface p-1">
        {tab("customers", "손님 목록")}
        {tab("instructors", "강사 목록")}
      </nav>
      <p className="text-sm text-ink-muted">
        {type === "customers"
          ? "쓰던 엑셀 손님 명단을 올리면 손님 카드가 한 번에 만들어집니다. 이미 있는 연락처와 파일 안의 같은 연락처는 건너뜁니다."
          : "함께 일하는 강사 명단을 올리면, 가입한 강사에게 전속 초대를 한 번에 보냅니다. 가입하지 않은 강사는 가입 안내 주소를 알려 드립니다."}
      </p>
      <ImportForm key={type} type={type} />
    </div>
  );
}
