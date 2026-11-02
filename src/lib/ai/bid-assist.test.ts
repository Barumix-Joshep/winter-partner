import { describe, expect, it } from "vitest";
import { bidPrompt, labelBids, parseBidAssist, ruleFlags, type BidContext } from "./bid-assist";

const bids: BidContext[] = [
  { bid_id: "b1", bidder_type: "instructor", amount: 80000, memo: "010-1234-5678로 연락 주세요", rating: 4.8, lessons: 30, certs: ["KSIA Level 2"], penalty: 0, with_shop: 3 },
  { bid_id: "b2", bidder_type: "shop", amount: 150000, memo: "강사 2명 투입", rating: null, lessons: 12, certs: [], penalty: 0, with_shop: 0 },
  { bid_id: "b3", bidder_type: "instructor", amount: 170000, memo: null, rating: null, lessons: 1, certs: [], penalty: 3, with_shop: 0 },
];
const job = { lessonLabel: "1:2", studentCount: 2, levels: ["초급"], note: "아이 둘 처음", ceiling: 200000, sport: "스키" };

describe("bid assist", () => {
  it("이름 없이 강사1·팀1로, 연락처는 지운다", () => {
    expect(labelBids(bids).map((b) => b.label)).toEqual(["강사1", "팀1", "강사2"]);
    const p = bidPrompt(job, bids);
    expect(p.text).toContain("강사1: 80,000원");
    expect(p.text).not.toContain("010-1234-5678");
    expect(p.labels.get("팀1")).toBe("b2");
  });
  it("규칙 경고", () => {
    expect(ruleFlags(bids, 200000)).toEqual({ b1: ["상한의 절반 미만 금액"], b3: ["패널티 3점", "검증된 자격증 없음"] });
  });
  it("응답을 입찰 id로 되돌리고 모르는 표시는 버린다", () => {
    const { labels } = bidPrompt(job, bids);
    const r = parseBidAssist(
      { recommended: "팀1", reasons: ["a", "b", "c"], bids: [{ label: "강사1", note: "싸지만 연락처를 한마디에 적음" }, { label: "강사9", note: "x" }], flags: [{ label: "강사1", flag: "한마디에 연락처" }] },
      labels,
    );
    expect(r).toEqual({ recommended: "b2", reasons: ["a", "b"], notes: { b1: "싸지만 연락처를 한마디에 적음" }, flags: { b1: ["한마디에 연락처"] } });
  });
  it("추천 표시가 없으면 무효", () => {
    expect(parseBidAssist({ recommended: "강사9", reasons: [], bids: [], flags: [] }, bidPrompt(job, bids).labels)).toBeNull();
  });
});
