// 샵 홈 상단 시작 체크리스트 (P16-4). 완료 여부는 DB(shop_onboarding)가 데이터로 판단한다.

export type OnboardingStatus = {
  info: boolean;
  resorts: boolean;
  instructors: boolean;
  first_job: boolean;
  push: boolean;
  hidden: boolean;
  approved: boolean;
};
type Key = "info" | "resorts" | "instructors" | "first_job" | "push";
export type Step = { key: Key; title: string; desc: string; links: { href: string; label: string }[]; done: boolean };

const STEPS: Omit<Step, "done">[] = [
  { key: "info", title: "샵 정보", desc: "사업자번호와 대표자 이름을 넣어 주세요. 정산서에 들어갑니다.", links: [{ href: "/shop/settings", label: "샵 정보 입력" }] },
  { key: "resorts", title: "영업 스키장", desc: "강습하는 스키장을 고르면 그 스키장 강사가 먼저 보입니다.", links: [{ href: "/shop/settings", label: "스키장 고르기" }] },
  {
    key: "instructors",
    title: "강사 등록",
    desc: "함께 일하는 강사에게 전속 초대를 보내거나, 프리랜서 강사를 찾아 의뢰하세요.",
    links: [
      { href: "/shop/import?type=instructors", label: "강사 목록 올리기 (전속 초대)" },
      { href: "/shop/instructors", label: "프리랜서 찾기" },
    ],
  },
  { key: "first_job", title: "첫 강습 등록", desc: "손님 접수 문자를 붙여 넣으면 칸이 채워집니다.", links: [{ href: "/shop/jobs/new", label: "강습 등록" }] },
  { key: "push", title: "알림 켜기", desc: "강사가 수락·완료하면 이 기기로 바로 알려 드립니다.", links: [{ href: "/notifications", label: "알림 켜기" }] },
];

export function onboardingSteps(s: OnboardingStatus) {
  const steps: Step[] = STEPS.map((x) => ({ ...x, done: s[x.key] }));
  const done = steps.filter((x) => x.done).length;
  return { steps, done, allDone: done === steps.length, next: steps.find((x) => !x.done) ?? null };
}
