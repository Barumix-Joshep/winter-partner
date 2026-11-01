import { Suspense } from "react";
import Link from "next/link";
import { requireArea } from "@/lib/auth/session";
import { requestTime } from "@/lib/time";
import { getMyInstructorProfile } from "@/lib/instructor/profile";
import { Placeholder } from "@/components/placeholder";
import { Exclusive } from "./exclusive";
import { Offers } from "./offers";
import { ToReport } from "./to-report";
import { getMyInstructorId } from "@/lib/instructor/profile";

export default function InstructorHome() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <Suspense>
        <ProfilePrompt />
        <OffersSection />
        <ToReportSection />
        <ExclusiveSection />
      </Suspense>
      <Placeholder title="오늘 강습" next="오늘 강습과 받은 의뢰가 여기에 들어옵니다 (P5-5)." />
    </div>
  );
}

// 종목·스키장을 아직 안 정했으면 프로필부터 (샵 검색에 안 잡힌다)
async function ProfilePrompt() {
  const user = await requireArea("instructor");
  const profile = await getMyInstructorProfile(user.id);
  const incomplete = !profile || profile.sportIds.length === 0 || profile.resortIds.length === 0;
  return (
    <Link
      href="/instructor/profile"
      className={`flex min-h-11 items-center justify-between rounded-[14px] border p-4 text-sm ${
        incomplete ? "border-[#F3D4A8] bg-[#FFF1E0] text-[#7A3E06]" : "border-line bg-white"
      }`}
    >
      <span>{incomplete ? "프로필을 채우면 샵 검색에 보입니다" : "내 프로필"}</span>
      <span aria-hidden>›</span>
    </Link>
  );
}

async function ExclusiveSection() {
  const user = await requireArea("instructor");
  return <Exclusive userId={user.id} />;
}

async function OffersSection() {
  const user = await requireArea("instructor");
  const id = await getMyInstructorId(user.id);
  return id ? <Offers instructorId={id} now={requestTime()} /> : null;
}

async function ToReportSection() {
  const user = await requireArea("instructor");
  const id = await getMyInstructorId(user.id);
  return id ? <ToReport instructorId={id} now={requestTime()} /> : null;
}
