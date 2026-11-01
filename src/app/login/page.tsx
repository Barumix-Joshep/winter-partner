import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-navy px-5 pt-14 pb-8 text-white">
        <p className="text-xs text-navy-muted">렌탈샵 · 강습팀 · 강사</p>
        <h1 className="mt-1 text-2xl font-bold">겨울파트너</h1>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-6">
        <Suspense>
          <LoginForm />
        </Suspense>
      </main>
    </div>
  );
}
