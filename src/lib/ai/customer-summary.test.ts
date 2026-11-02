import { describe, expect, it } from "vitest";
import { parseSummary, summaryPrompt, type SummaryInput } from "./customer-summary";

const input: SummaryInput = {
  name: "박민준",
  linkedNames: ["박서윤"],
  level: "초급",
  memo: "동생 박서윤과 같이 오면 집중 잘함. 엄마 010-1111-2222",
  lessons: [{ date: "2026-01-18", sport: "스키", lesson: "1:2", status: "approved", note: "박민준 플루그보겐 좌우 가능, 무릎 부상 주의" }],
  contacts: [{ date: "2026-11-01", channel: "전화", memo: "시즌 오픈 안내" }],
  marketingOk: false,
};

describe("customer summary", () => {
  it("이름·연락처·건강 단어를 빼고 보낸다", () => {
    const { text } = summaryPrompt(input);
    expect(text).not.toMatch(/박민준|박서윤|010-1111-2222|부상/);
    expect(text).toContain("손님A");
    expect(text).toContain("연락 문구는 만들지 마세요");
  });
  it("응답 속 가명을 이름으로 되돌린다", () => {
    const { aliases } = summaryPrompt(input);
    const r = parseSummary({ summary: ["손님A는 플루그보겐 가능", "손님B와 함께 오면 집중"], next_lesson: "손님A 패러렐 입문", contact_draft: null }, aliases, false);
    expect(r).toEqual({ summary: ["박민준는 플루그보겐 가능", "박서윤와 함께 오면 집중"], nextLesson: "박민준 패러렐 입문", contactDraft: null });
  });
  it("광고 동의가 없으면 연락 문구를 버린다", () => {
    const { aliases } = summaryPrompt(input);
    expect(parseSummary({ summary: [], next_lesson: null, contact_draft: "할인 안내" }, aliases, false)?.contactDraft).toBeNull();
    expect(parseSummary({ summary: [], next_lesson: null, contact_draft: "할인 안내" }, aliases, true)?.contactDraft).toBe("할인 안내");
  });
});
