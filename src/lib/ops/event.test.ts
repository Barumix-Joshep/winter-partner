import { describe, expect, it } from "vitest";
import { cronDetail, errorDetail, OPS_DETAIL_MAX } from "./event";

describe("errorDetail", () => {
  it("오류 이름과 메시지를 짧게 남긴다", () => {
    expect(errorDetail(new TypeError("x is undefined"))).toBe("TypeError: x is undefined");
  });
  it("연락처·이메일은 지운다", () => {
    const d = errorDetail(new Error("duplicate 010-1234-5678 kim@test.com"));
    expect(d).not.toMatch(/1234|kim@/);
    expect(d).toContain("[전화]");
  });
  it("digest가 있으면 붙인다(React가 감춘 메시지)", () => {
    const e = Object.assign(new Error("An error occurred in the Server Components render."), { digest: "12345" });
    expect(errorDetail(e)).toContain("digest 12345");
  });
  it("Error가 아니어도 문자열로", () => {
    expect(errorDetail("boom")).toBe("boom");
  });
  it("300자로 자른다", () => {
    expect(errorDetail(new Error("a".repeat(1000))).length).toBeLessThanOrEqual(300);
  });
});

// 2026-11-07 03:00 정리 작업 기록이 300자(record_ops_event의 left(…, 300))에서 잘려 JSON이 깨졌다.
// 아침 점검 SQL(detail::jsonb)이 오류가 나지 않게, 운영 기록에는 언제나 300자 안의 올바른 JSON을 남긴다.
describe("cronDetail", () => {
  const daily = (n: number) => ({
    ok: true,
    anonymizedCustomers: n,
    purgedAccessLogs: n,
    purgedConsult: { feedback: n, messages: n, conversations: n, inquiries_kept: n, inquiries_deleted: n },
    consultLicenses: { required: false, suspended: n, quota_reached: n, trial_started: n, expiry_notices: n, quota_warnings: n },
    instagramTokens: { skipped: true, refreshed: n, failed: n, expired: n },
  });
  it("2026-11-07 실제 결과(모두 0)는 300자를 넘었다 — 그대로 쓰면 잘린다", () => {
    expect(JSON.stringify(daily(0)).length).toBeGreaterThan(OPS_DETAIL_MAX);
  });
  it("안쪽의 0인 항목은 빼고(없으면 0), 참·거짓과 맨 위 숫자는 남긴다", () => {
    const d = cronDetail(daily(0));
    expect(d.length).toBeLessThanOrEqual(OPS_DETAIL_MAX);
    expect(JSON.parse(d)).toEqual({
      ok: true, anonymizedCustomers: 0, purgedAccessLogs: 0, purgedConsult: {},
      consultLicenses: { required: false }, instagramTokens: { skipped: true },
    });
  });
  it("0이 아닌 건수는 그대로 남긴다", () => {
    const d = JSON.parse(cronDetail({ ...daily(0), purgedConsult: { conversations: 3, messages: 12, feedback: 0 } }));
    expect(d.purgedConsult).toEqual({ conversations: 3, messages: 12 });
  });
  it("건수가 모두 커서 그래도 길면 맨 위 값만 남기고 cut 표시 — 언제나 올바른 JSON", () => {
    const d = cronDetail(daily(1234567));
    expect(d.length).toBeLessThanOrEqual(OPS_DETAIL_MAX);
    expect(JSON.parse(d)).toEqual({ ok: true, anonymizedCustomers: 1234567, purgedAccessLogs: 1234567, cut: true });
  });
  it("짧은 결과는 그대로(알림 보내기 {sent})", () => {
    expect(cronDetail({ sent: 0 })).toBe('{"sent":0}');
  });
});
