// 보안 3(서버 측 권한): 수업 메모 정리(tidyNote)는 자기가 배정된 강습에만 AI를 부른다.
// 강사에게 보이는 다른 샵 입찰 공고 id로 부르면 그 샵의 AI 호출 상한·사용 기록을 남이 쓰게 된다.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mine = new Set<string>();
const shopOf: Record<string, string> = { "job-mine": "shop-a", "job-open-bid": "shop-b" };

function table(name: string) {
  const filters: Record<string, string> = {};
  const q = {
    select: () => q,
    eq: (col: string, v: string) => ((filters[col] = v), q),
    maybeSingle: async () => {
      const id = filters.id ?? filters.job_id;
      if (name === "jobs") return { data: shopOf[id] ? { shop_id: shopOf[id] } : null }; // RLS로 보이는 강습(입찰 공고 포함)
      if (name === "instructor_assignments") return { data: mine.has(id) ? { job_id: id } : null };
      return { data: null };
    },
  };
  return q;
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: table }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }) }) }) }));
vi.mock("@/lib/auth/session", () => ({ requireArea: async () => ({ id: "user-kim" }) }));
vi.mock("@/lib/ai/flags", () => ({ isAiEnabled: async () => true }));
const callStructured = vi.fn(async () => ({ progress: "p", good: "g", next: "n", healthSentences: [] }));
vi.mock("@/lib/ai/client", () => ({ callStructured: (...a: unknown[]) => callStructured(...(a as [])) }));
vi.mock("@/lib/notify/dispatch", () => ({ notifyAfterResponse: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));

const { tidyNote } = await import("./actions");

describe("tidyNote 소유권", () => {
  beforeEach(() => {
    mine.clear();
    callStructured.mockClear();
  });

  it("자기 배정 강습이면 그 샵 이름으로 AI를 부른다", async () => {
    mine.add("job-mine");
    const r = await tidyNote("job-mine", "플루그보겐까지 진행함");
    expect(r.message).toBeUndefined();
    expect(callStructured).toHaveBeenCalledWith(expect.objectContaining({ shopId: "shop-a", feature: "note_tidy" }));
  });

  it("보이기만 하는 다른 샵 입찰 공고면 AI를 부르지 않는다", async () => {
    const r = await tidyNote("job-open-bid", "플루그보겐까지 진행함");
    expect(r.message).toBeDefined();
    expect(callStructured).not.toHaveBeenCalled();
  });
});
