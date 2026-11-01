import { describe, expect, it } from "vitest";
import { parseJob } from "./job";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const base = {
  resort_id: "8",
  sport_id: "1",
  date: "2026-12-20",
  start: "10:00",
  end: "12:00",
  lesson_type: "semi",
  student_count: "2",
  customer_price: "220,000",
  instructor_rate: "120000",
  patch_paid_by: "shop",
  note: " 둘 다 처음 ",
  customer_id: "",
  new_customer_name: "박민준",
  new_customer_phone: "010-1234-5678",
  new_customer_level: "초급",
};

describe("parseJob", () => {
  it("한국 시간으로 강습 시간을 만든다", () => {
    const r = parseJob(form(base), [8]);
    expect(r.ok && r.data).toMatchObject({
      resortId: 8,
      sportId: 1,
      startsAt: "2026-12-20T10:00:00+09:00",
      endsAt: "2026-12-20T12:00:00+09:00",
      lessonType: "semi",
      studentCount: 2,
      customerPrice: 220000,
      instructorRate: 120000,
      patchPaidBy: "shop",
      note: "둘 다 처음",
      customerId: null,
      newCustomer: { name: "박민준", phone: "010-1234-5678", level: "초급", privacy_consent: false },
    });
  });

  it("끝나는 시간이 시작보다 늦어야 한다", () => {
    const r = parseJob(form({ ...base, end: "09:00" }), [8]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.end).toBeDefined();
  });

  it("강습 유형에 맞는 인원 (1:1은 1명, 1:2는 2명, 그룹은 3~10명)", () => {
    expect(parseJob(form({ ...base, lesson_type: "private", student_count: "2" }), [8]).ok).toBe(false);
    expect(parseJob(form({ ...base, lesson_type: "group", student_count: "2" }), [8]).ok).toBe(false);
    expect(parseJob(form({ ...base, lesson_type: "group", student_count: "5" }), [8]).ok).toBe(true);
  });

  it("영업 스키장이 아니면 막는다", () => {
    expect(parseJob(form({ ...base, resort_id: "1" }), [8]).ok).toBe(false);
  });

  it("기존 손님을 고르면 새 손님 입력은 무시한다", () => {
    const r = parseJob(form({ ...base, customer_id: "30000000-0000-0000-0000-000000000001" }), [8]);
    expect(r.ok && [r.data.customerId, r.data.newCustomer]).toEqual(["30000000-0000-0000-0000-000000000001", null]);
  });

  it("금액은 숫자만, 비워도 된다", () => {
    expect(parseJob(form({ ...base, customer_price: "", instructor_rate: "" }), [8]).ok).toBe(true);
    expect(parseJob(form({ ...base, customer_price: "십만원" }), [8]).ok).toBe(false);
  });
});
