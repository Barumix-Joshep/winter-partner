"use client";

import Link from "next/link";

// 오류 화면 (P19-3). 오류 번호는 Next의 digest: 서버 오류는 instrumentation.ts가 운영 기록(ops_events)에 같은 번호로 남기므로
// 본사가 /admin/ops에서 찾을 수 있다. 화면에는 오류 내용(개인정보가 섞일 수 있음)을 보여 주지 않는다.
export function errorCode(error: unknown) {
  return error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;
}

export function ErrorScreen({ error, retry, home = "/" }: { error: unknown; retry?: () => void; home?: string }) {
  const code = errorCode(error);
  return (
    <div role="alert" className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-[14px] border border-line bg-white p-6 text-center">
      <p className="text-lg font-bold">잠깐 문제가 생겼습니다</p>
      <p className="text-sm text-ink-muted">잠시 후 다시 시도해 주세요. 계속 안 되면 아래 오류 번호와 함께 본사에 알려 주세요.</p>
      <p className="text-xs text-ink-muted">오류 번호: {code ?? "화면 오류 (번호 없음)"}</p>
      <div className="flex justify-center gap-2">
        {retry && (
          <button onClick={() => retry()} className="min-h-11 rounded-[10px] bg-brand px-5 text-sm font-medium text-white">
            다시 시도
          </button>
        )}
        <Link href={home} className="flex min-h-11 items-center rounded-[10px] border border-line px-5 text-sm font-medium">
          홈으로
        </Link>
      </div>
    </div>
  );
}
