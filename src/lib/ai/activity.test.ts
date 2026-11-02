import { describe, expect, it } from "vitest";
import { activityPrompt, parseActivity } from "./activity";

describe("activity", () => {
  it("숫자만 보낸다", () => {
    expect(activityPrompt({ bids_30d: 5, cancels_30d: 2, avg_rating: null })).toBe(
      "입찰: 5\n선정된 입찰: 없음\n완료 강습: 없음\n일방 취소: 2\n누적 패널티 점수: 없음\n거절한 직접 의뢰: 없음\n평균 평점: 없음",
    );
  });
  it("요약 문장", () => {
    expect(parseActivity({ summary: "최근 취소가 잦습니다." })).toBe("최근 취소가 잦습니다.");
    expect(parseActivity({})).toBeNull();
  });
});
