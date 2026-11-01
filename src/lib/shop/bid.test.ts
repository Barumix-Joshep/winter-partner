import { describe, expect, it } from "vitest";
import { defaultBidClose, kstLocalInput, parseBidAmount, parseKstLocal } from "./bid";

describe("parseKstLocal", () => {
  it("datetime-local 값을 한국 시간으로 읽는다", () => {
    expect(parseKstLocal("2027-01-08T18:00")).toBe("2027-01-08T18:00:00+09:00");
    expect(parseKstLocal("2027-01-08")).toBeNull();
    expect(parseKstLocal("")).toBeNull();
  });
});

describe("defaultBidClose", () => {
  it("강습 전날 18시 (한국 시간)", () => {
    expect(defaultBidClose("2027-01-09T01:00:00Z")).toBe("2027-01-08T18:00");
  });
});

describe("kstLocalInput", () => {
  it("UTC 시각을 datetime-local 값(한국 시간)으로", () => {
    expect(kstLocalInput("2027-01-08T09:00:00Z")).toBe("2027-01-08T18:00");
  });
});

describe("parseBidAmount", () => {
  it("상한 이하 양수만", () => {
    expect(parseBidAmount("130,000", 150000)).toEqual({ ok: true, amount: 130000 });
    expect(parseBidAmount("160000", 150000).ok).toBe(false);
    expect(parseBidAmount("0", 150000).ok).toBe(false);
    expect(parseBidAmount("abc", 150000).ok).toBe(false);
  });
});
