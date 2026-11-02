import Link from "next/link";
import { ResetForm } from "../password-forms";

export default function Page() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-navy px-5 pt-14 pb-8 text-white">
        <p className="text-xs text-navy-muted">겨울파트너</p>
        <h1 className="mt-1 text-2xl font-bold">새 비밀번호 정하기</h1>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-5 py-6">
        <p className="text-sm text-ink-muted">재설정 링크로 들어오셨습니다. 새 비밀번호를 정해 주세요.</p>
        <div className="rounded-[14px] border border-line bg-white p-5">
          <ResetForm />
        </div>
        <Link href="/login" className="flex min-h-11 items-center self-start text-sm text-brand underline">
          로그인으로 돌아가기
        </Link>
      </main>
    </div>
  );
}
