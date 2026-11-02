import { describe, expect, it } from "vitest";
import { LIMITS, limitKey, limitMessage } from "./limits";

describe("요청 횟수 제한 값", () => {
  it("키에 이메일·IP 원문이 없다", () => {
    const k = limitKey("login_account", "Kim@Test.com");
    expect(k).toMatch(/^login_account:[0-9a-f]{32}$/);
    expect(k).not.toContain("kim");
  });
  it("대소문자·공백이 달라도 같은 계정", () => {
    expect(limitKey("login_account", " KIM@test.com")).toBe(limitKey("login_account", "kim@test.com"));
  });
  it("종류가 다르면 다른 키", () => {
    expect(limitKey("reset_ip", "1.2.3.4")).not.toBe(limitKey("signup_ip", "1.2.3.4"));
  });
  it("안내 문구는 기다릴 시간을 알려 준다", () => {
    expect(limitMessage("login_account")).toBe("요청이 너무 많습니다. 10분 뒤에 다시 시도해 주세요.");
    expect(limitMessage("reset_account")).toBe("요청이 너무 많습니다. 1시간 뒤에 다시 시도해 주세요.");
  });
  it("정상 사용을 막지 않는 최소값", () => {
    // 샵 한 곳의 직원들이 같은 IP(매장 와이파이)로 비밀번호를 몇 번 틀려도 막히지 않는다
    expect(LIMITS.login_ip.max).toBeGreaterThanOrEqual(LIMITS.login_account.max * 3);
    expect(LIMITS.login_ip.count).toBe("fail");
    // 하루 상한 200회인 AI를 10분에 30회까지
    expect(LIMITS.ai_user.max).toBeGreaterThanOrEqual(30);
  });
});
