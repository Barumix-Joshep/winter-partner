import { describe, expect, it } from "vitest";

// P20-6 임시: CI가 실패한 풀 리퀘스트를 막는지 확인용. 병합하지 않고 닫는다.
describe("CI 차단 확인 (임시)", () => {
  it("일부러 실패한다", () => {
    expect(1 + 1).toBe(3);
  });
});
