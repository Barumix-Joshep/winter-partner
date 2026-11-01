import Link from "next/link";

// 오프라인 셸: 연결이 끊겼을 때 서비스 워커가 보여 준다 (정적 페이지, 개인 데이터 없음)
export default function OfflinePage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-navy px-5 pt-14 pb-8 text-white">
        <h1 className="text-2xl font-bold">겨울파트너</h1>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-5 py-8">
        <p className="text-lg font-bold">인터넷 연결이 끊겼습니다</p>
        <p className="text-sm text-ink-muted">슬로프에서는 신호가 약할 수 있습니다. 연결되면 다시 열어 주세요. 의뢰·완료 보고는 연결된 뒤에 보내야 합니다.</p>
        <Link href="/" className="flex min-h-11 items-center justify-center rounded-[10px] bg-brand text-sm font-medium text-white">
          다시 시도
        </Link>
      </main>
    </div>
  );
}
