import { describe, expect, it } from "vitest";
import { parseInstructorProfile } from "./validate";

function form(fields: Record<string, string | string[]>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) fd.append(k, x);
  return fd;
}

describe("parseInstructorProfile", () => {
  const base = { level: " KSIA Level 2 ", bio: "어린이 강습 7년", base_rate: "80,000", sport_ids: ["1"], resort_ids: ["8", "6"] };

  it("프로필을 다듬어 돌려준다 (금액 쉼표 허용)", () => {
    expect(parseInstructorProfile(form(base))).toEqual({
      ok: true,
      data: { level: "KSIA Level 2", bio: "어린이 강습 7년", baseRate: 80000, sportIds: [1], resortIds: [8, 6] },
    });
  });

  it("레벨·소개·기본 강습료는 비워도 된다", () => {
    const r = parseInstructorProfile(form({ ...base, level: "", bio: "", base_rate: "" }));
    expect(r.ok && r.data).toMatchObject({ level: null, bio: null, baseRate: null });
  });

  it("종목·스키장은 하나 이상", () => {
    const r = parseInstructorProfile(form({ ...base, sport_ids: [], resort_ids: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.sportIds).toBeDefined();
      expect(r.errors.resortIds).toBeDefined();
    }
  });

  it("강습료는 0 이상 정수, 소개는 500자까지", () => {
    expect(parseInstructorProfile(form({ ...base, base_rate: "-1" })).ok).toBe(false);
    expect(parseInstructorProfile(form({ ...base, base_rate: "8만" })).ok).toBe(false);
    expect(parseInstructorProfile(form({ ...base, bio: "가".repeat(501) })).ok).toBe(false);
  });
});
