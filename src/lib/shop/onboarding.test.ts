import { describe, expect, it } from "vitest";
import { onboardingSteps } from "./onboarding";

const none = { info: false, resorts: false, instructors: false, first_job: false, push: false, hidden: false, approved: true };

describe("시작 체크리스트", () => {
  it("순서: 샵 정보 → 영업 스키장 → 강사 등록 → 첫 강습 → 알림", () => {
    expect(onboardingSteps(none).steps.map((s) => s.key)).toEqual(["info", "resorts", "instructors", "first_job", "push"]);
  });
  it("다음 할 일은 처음 남은 것", () => {
    const r = onboardingSteps({ ...none, info: true, resorts: true });
    expect(r.next?.key).toBe("instructors");
    expect(r.done).toBe(2);
    expect(r.allDone).toBe(false);
  });
  it("강사 등록은 전속 초대와 프리랜서 찾기 두 길", () => {
    const s = onboardingSteps(none).steps.find((x) => x.key === "instructors")!;
    expect(s.links.map((l) => l.href)).toEqual(["/shop/import?type=instructors", "/shop/instructors"]);
  });
  it("모두 끝나면 allDone", () => {
    const r = onboardingSteps({ ...none, info: true, resorts: true, instructors: true, first_job: true, push: true });
    expect(r.allDone).toBe(true);
    expect(r.next).toBeNull();
  });
});
