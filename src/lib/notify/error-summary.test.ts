import { describe, expect, it } from "vitest";
import { pushErrorSummary } from "./error-summary";

describe("pushErrorSummary (P19-3)", () => {
  it("구독 주소·본문은 남기지 않고 종류와 상태 코드만", () => {
    const e = Object.assign(new Error("Received unexpected response code"), {
      name: "WebPushError",
      statusCode: 410,
      endpoint: "https://fcm.googleapis.com/fcm/send/SECRET-DEVICE-TOKEN",
      body: "push subscription has unsubscribed or expired.",
    });
    const s = pushErrorSummary(e);
    expect(s).toBe("WebPushError 410");
    expect(s).not.toContain("SECRET");
    expect(pushErrorSummary(Object.assign(new Error("x"), { code: "ECONNRESET" }))).toBe("Error ECONNRESET");
    expect(pushErrorSummary("boom")).toBe("string");
  });
});
