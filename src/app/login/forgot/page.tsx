import Link from "next/link";
import { ForgotForm } from "../password-forms";

export default function Page() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-navy px-5 pt-14 pb-8 text-white">
        <p className="text-xs text-navy-muted">겨울파트너</p>
        <h1 className="mt-1 text-2xl font-bold">비밀번호 찾기</h1>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-5 py-6">
        <p className="text-sm text-ink-muted">가입한 이메일로 재설정 링크를 보내 드립니다.</p>
        <div className="rounded-[14px] border border-line bg-white p-5">
          <ForgotForm />
        </div>
        <Link href="/login" className="flex min-h-11 items-center self-start text-sm text-brand underline">
          로그인으로 돌아가기
        </Link>
      </main>
    </div>
  );
}
