import { Suspense } from "react";
import { requireArea } from "@/lib/auth/session";
import { getMyInstructorProfile, getReferenceData } from "@/lib/instructor/profile";
import { ProfileForm } from "./profile-form";
import { Certs } from "./certs";
import { LogoutButton } from "@/components/logout-button";

export default function ProfilePage() {
  return (
    <>
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <Profile />
      </Suspense>
      <div className="mx-auto mt-10 max-w-md">
        <LogoutButton className="min-h-11 w-full rounded-[10px] border border-line bg-white text-sm text-ink-muted" />
      </div>
    </>
  );
}

async function Profile() {
  const user = await requireArea("instructor");
  const [profile, ref] = await Promise.all([getMyInstructorProfile(user.id), getReferenceData()]);
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-lg font-bold">내 프로필</h1>
      <p className="mt-1 text-sm text-ink-muted">샵이 강사를 찾을 때 이 정보가 보입니다. 연락처는 보이지 않습니다.</p>
      <ProfileForm profile={profile} sports={ref.sports} resorts={ref.resorts} />
      <Certs userId={user.id} />
    </div>
  );
}
