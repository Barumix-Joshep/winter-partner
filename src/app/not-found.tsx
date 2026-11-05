import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center px-4 py-10">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-[14px] border border-line bg-white p-6 text-center">
        <p className="text-lg font-bold">찾는 화면이 없습니다</p>
        <p className="text-sm text-ink-muted">주소가 바뀌었거나 볼 수 없는 화면입니다. 홈에서 다시 찾아 주세요.</p>
        <Link href="/" className="mx-auto flex min-h-11 items-center rounded-[10px] bg-brand px-5 text-sm font-medium text-white">
          홈으로
        </Link>
      </div>
    </main>
  );
}
