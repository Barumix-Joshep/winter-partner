import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { homePathFor } from "@/lib/auth/routing";
import { OnboardingForm } from "./onboarding-form";

export default function OnboardingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-navy px-5 pt-14 pb-8 text-white">
        <p className="text-xs text-navy-muted">처음 오셨네요</p>
        <h1 className="mt-1 text-2xl font-bold">어떤 분이세요?</h1>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-6">
        <Suspense>
          <Gate />
        </Suspense>
      </main>
    </div>
  );
}

// 이미 역할이 있으면 자기 화면으로
async function Gate() {
  const user = await getCurrentUser();
  if (user.role) redirect(homePathFor(user));
  return <OnboardingForm />;
}
