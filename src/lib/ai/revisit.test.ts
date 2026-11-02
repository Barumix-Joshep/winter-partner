import { describe, expect, it } from "vitest";
import { parseRevisit, revisitPrompt } from "./revisit";

const list = [
  { customer_id: "c1", name: "박민준", level: "초급", lessons: 3, last_lesson: "2026-02-10", sport: "스키" },
  { customer_id: "c2", name: "이서아", level: null, lessons: 1, last_lesson: null, sport: "스노우보드" },
];

describe("revisit", () => {
  it("이름 없이 보낸다", () => {
    const { text } = revisitPrompt("하이원 스노우렌탈", list);
    expect(text).not.toMatch(/박민준|이서아/);
    expect(text).toContain("손님1: 스키, 레벨 초급, 지난 시즌 강습 3회");
    expect(text).toContain("손님2: 스노우보드,");
  });
  it("종목을 모르면 스키로 넘겨짚지 않는다 (P17)", () => {
    const { text } = revisitPrompt("하이원 스노우렌탈", [{ customer_id: "c3", name: "최도윤", level: null, lessons: 1, last_lesson: null, sport: null }]);
    expect(text).toContain("손님1: 종목 모름,");
  });
  it("이미 (광고)로 시작하면 그대로", () => {
    const { labels } = revisitPrompt("샵", list);
    expect(parseRevisit({ messages: [{ label: "손님1", message: "(광고) 손님1님 안녕하세요" }] }, labels)).toEqual({ c1: "(광고) 박민준님 안녕하세요" });
  });
  it("문구 속 표시를 이름으로 되돌리고 모르는 표시는 버린다", () => {
    const { labels } = revisitPrompt("샵", list);
    expect(parseRevisit({ messages: [{ label: "손님1", message: "손님1님, 올해는 패러렐 어떠세요?" }, { label: "손님9", message: "x" }] }, labels)).toEqual({ c1: "(광고) 박민준님, 올해는 패러렐 어떠세요?" });
  });
});
