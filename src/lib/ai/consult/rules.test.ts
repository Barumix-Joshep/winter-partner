import { describe, expect, it } from "vitest";
import { extractAmounts, unknownAmounts } from "./amounts";
import { fitChannel, preCheck } from "./rules";

describe("인젝션 규칙 오탐 없음", () => {
  it.each(["이전에 예약한 강습 취소 규정이 궁금해요", "시스템 스키 세트 대여료 얼마예요?", "규칙적으로 강습 받고 싶어요", "아이 둘인데 같이 들을 수 있나요?", "Can I book a lesson for 2 people?"])(
    "%s",
    (t) => expect(preCheck(t).ok).toBe(true),
  );
});

describe("금액 인식", () => {
  it("여러 형태", () => {
    expect(extractAmounts("120,000원, 90000원, ₩45,000, 12만원, 12만 원, 3만5천원, 1.5만원")).toEqual([120000, 90000, 45000, 120000, 120000, 35000, 15000]);
  });
  it("금액이 아닌 숫자는 무시(2시간·2명·1:1)", () => {
    expect(extractAmounts("1:1 2시간 2명")).toEqual([]);
  });
  it("모두 안내 정보에 있으면 null, 없으면 그 금액", () => {
    expect(unknownAmounts("12만원이에요", ["1:1 120,000원"])).toBeNull();
    expect(unknownAmounts("130,000원이에요", ["1:1 120,000원"])).toEqual([130000]);
    expect(unknownAmounts("금액 없는 답", [])).toBeNull();
  });
});

describe("채널 길이", () => {
  it("짧으면 그대로", () => expect(fitChannel("안녕하세요", "kakao")).toBe("안녕하세요"));
  it("상담톡 1000자", () => expect([...fitChannel("가".repeat(1500), "kakao_cstalk")].length).toBeLessThanOrEqual(1000));
});
