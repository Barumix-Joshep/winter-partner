// P22-5 사장님 인박스 도움 함수: 목록 순서, 하루 범위(한국 시간), 답장 글 검사(인스타 1000바이트), 틀림/고침 피드백, 안내 정보 미리 채우기, 갱신 표시값.
import { describe, expect, it } from "vitest";
import { canConvert, customerLabel, displayText, feedbackRow, inboxVersion, kbPrefill, kstDayRange, kstToday, ownerTextError, sortConversations } from "./inbox";

describe("sortConversations", () => {
  it("사장님 대기(waiting_owner)를 먼저, 그다음 손님 마지막 메시지가 최근인 순서", () => {
    const list = [
      { id: "a", status: "bot", last_customer_message_at: "2026-12-20T05:00:00Z" },
      { id: "b", status: "waiting_owner", last_customer_message_at: "2026-12-20T01:00:00Z" },
      { id: "c", status: "owner", last_customer_message_at: null },
      { id: "d", status: "waiting_owner", last_customer_message_at: "2026-12-20T03:00:00Z" },
    ];
    expect(sortConversations(list).map((c) => c.id)).toEqual(["d", "b", "a", "c"]);
  });
});

describe("kstDayRange", () => {
  it("한국 날짜 하루를 UTC 시각 범위로", () => {
    expect(kstDayRange("2026-12-20")).toEqual({ from: "2026-12-19T15:00:00.000Z", to: "2026-12-20T15:00:00.000Z" });
  });
  it("형식이 아니면 null", () => {
    expect(kstDayRange("2026-13-40")).toBeNull();
    expect(kstDayRange("어제")).toBeNull();
    expect(kstDayRange(undefined)).toBeNull();
  });
  it("오늘(한국 시간)", () => {
    expect(kstToday(new Date("2026-12-19T15:30:00Z"))).toBe("2026-12-20");
  });
});

describe("ownerTextError", () => {
  it("빈 답장은 거부", () => {
    expect(ownerTextError("  ", "kakao")).toMatch(/적어/);
  });
  it("인스타는 1000바이트(한글 약 330자)까지", () => {
    expect(ownerTextError("가".repeat(333), "instagram")).toBeNull();
    expect(ownerTextError("가".repeat(334), "instagram")).toMatch(/330자/);
  });
  it("카카오(복사)는 2000자까지", () => {
    expect(ownerTextError("가".repeat(2000), "kakao")).toBeNull();
    expect(ownerTextError("가".repeat(2001), "kakao")).toMatch(/2,000자/);
  });
});

describe("feedbackRow", () => {
  it("고친 글이 없거나 초안과 같으면 wrong", () => {
    expect(feedbackRow("초안", undefined)).toEqual({ kind: "wrong", corrected_text: null });
    expect(feedbackRow("초안", " 초안 ")).toEqual({ kind: "wrong", corrected_text: null });
  });
  it("고쳤으면 edited + 고친 글", () => {
    expect(feedbackRow("초안", "고친 답")).toEqual({ kind: "edited", corrected_text: "고친 답" });
  });
  it("고친 글은 2000자까지 자른다", () => {
    expect(feedbackRow("", "가".repeat(2100)).corrected_text).toHaveLength(2000);
  });
});

describe("kbPrefill", () => {
  it("질문 첫 줄을 제목(80자), 사장님 답을 내용으로. 종류는 자주 묻는 질문", () => {
    expect(kbPrefill("  주차 되나요?\n두 대요", "리조트 주차장 무료예요")).toEqual({ kind: "faq", title: "주차 되나요?", content: "리조트 주차장 무료예요" });
    expect(kbPrefill("가".repeat(100), "답").title).toHaveLength(80);
  });
  it("질문이 비면 기본 제목", () => {
    expect(kbPrefill("", "").title).toBe("손님 문의");
  });
});

describe("customerLabel", () => {
  it("이름이 없으면 해시 앞 4자로만 구분 (손님 id 원문은 없다)", () => {
    expect(customerLabel({ display_name: null, external_user_hash: "abcdef".padEnd(64, "0") })).toBe("손님 #abcd");
    expect(customerLabel({ display_name: "[테스트] 김손님", external_user_hash: "0".repeat(64) })).toBe("[테스트] 김손님");
  });
});

describe("inboxVersion", () => {
  it("대기 수·마지막 메시지 시각이 바뀌면 값이 바뀐다", () => {
    expect(inboxVersion(2, "2026-12-20T01:00:00Z")).not.toBe(inboxVersion(3, "2026-12-20T01:00:00Z"));
    expect(inboxVersion(2, null)).toBe("2:");
  });
});

describe("displayText (P22-6)", () => {
  it("손님·AI·안내 글 속 전화·이메일은 가린다", () => {
    expect(displayText("customer", "010-0000-1234 / me@example.com 으로요")).toBe("010-****-1234 / m***@example.com 으로요");
    expect(displayText("system", "01000001234")).toBe("010-****-1234");
    expect(displayText("ai", "강습료 120,000원")).toBe("강습료 120,000원");
  });
  it("사장님이 쓴 답장은 그대로", () => {
    expect(displayText("owner", "샵 번호 033-000-0000")).toBe("샵 번호 033-000-0000");
  });
});

describe("canConvert (P22-6 강습 등록)", () => {
  it("답장 전·답장함만", () => {
    expect(canConvert("open")).toBe(true);
    expect(canConvert("replied")).toBe(true);
    expect(canConvert("converted")).toBe(false);
    expect(canConvert("closed")).toBe(false);
    expect(canConvert(undefined)).toBe(false);
  });
});
