import { Suspense } from "react";
import Link from "next/link";
import { requireArea } from "@/lib/auth/session";
import { requestTime } from "@/lib/time";
import { getMyInstructorId, getMyInstructorProfile } from "@/lib/instructor/profile";
import { Exclusive } from "./exclusive";
import { Offers } from "./offers";
import { ToReport } from "./to-report";
import { InstructorToday } from "./today";

// 강사 홈 (모바일, 프로토타입 IHome): 요약 → 받은 의뢰 → 완료 보고 → 오늘·내일 강습
export default function InstructorHome() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <Suspense fallback={<p className="text-sm text-ink-muted">불러오는 중…</p>}>
        <Home />
      </Suspense>
    </div>
  );
}

async function Home() {
  const user = await requireArea("instructor");
  const [id, profile] = await Promise.all([getMyInstructorId(user.id), getMyInstructorProfile(user.id)]);
  const now = requestTime();
  const incomplete = !profile || profile.sportIds.length === 0 || profile.resortIds.length === 0;
  return (
    <>
      {incomplete && (
        <Link
          href="/instructor/profile"
          className="flex min-h-11 items-center justify-between rounded-[14px] border border-[#F3D4A8] bg-[#FFF1E0] p-4 text-sm text-[#7A3E06]"
        >
          <span>프로필을 채우면 샵 검색에 보입니다</span>
          <span aria-hidden>›</span>
        </Link>
      )}
      {id && (
        <>
          <InstructorToday instructorId={id} now={now}>
            <Offers instructorId={id} now={now} />
            <ToReport instructorId={id} now={now} />
          </InstructorToday>
        </>
      )}
      <Exclusive userId={user.id} />
    </>
  );
}
