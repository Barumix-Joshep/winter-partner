import { describe, expect, it } from "vitest";
import { formatTidy, healthPayload, parseHealth, parseTidy, shouldAskHealthAi } from "./note";

describe("수업 메모 정리", () => {
  it("세 항목으로 정리하고 건강 문장은 따로", () => {
    const t = parseTidy({ progress: "플루그보겐", good: "자세 안정", next: "패러렐", health_sentences: ["무릎이 아프다고 함"] })!;
    expect(formatTidy(t)).toBe("진도: 플루그보겐\n잘된 점: 자세 안정\n다음 과제: 패러렐");
    expect(t.healthSentences).toEqual(["무릎이 아프다고 함"]);
  });
  it("형식이 아니면 null", () => expect(parseTidy({ progress: 1 })).toBeNull());
});

describe("건강정보 2차 감지", () => {
  it("분류만 남긴다", () => {
    expect(parseHealth({ has_health_info: true, categories: ["부상", "부상", "모름"] })).toEqual(["AI:부상"]);
    expect(parseHealth({ has_health_info: true, categories: [] })).toEqual(["AI:기타"]);
    expect(parseHealth({ has_health_info: false, categories: [] })).toEqual([]);
    expect(parseHealth({})).toBeNull();
  });
  it("정규식이 못 찾은 20자 이상만 묻는다", () => {
    expect(shouldAskHealthAi("짧은 메모", [])).toBe(false);
    expect(shouldAskHealthAi("오늘 내려오다가 넘어져서 손목을 다친 것 같다고 했음", [])).toBe(true);
    expect(shouldAskHealthAi("오늘 내려오다가 넘어져서 골절 의심, 병원 권유함", ["골절"])).toBe(false);
  });
  it("이름·연락처는 지우고 건강 단어는 남긴다", () => {
    expect(healthPayload("박민준 손목 통증 010-1111-2222", ["박민준"])).toBe("손님A 손목 통증 [전화]");
  });
});
