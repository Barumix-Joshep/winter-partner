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

const NOW = Date.parse("2026-12-01T00:00:00+09:00");

describe("parseJob", () => {
  it("한국 시간으로 강습 시간을 만든다", () => {
    const r = parseJob(form(base), [8], NOW);
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
      newCustomer: { name: "박민준", phone: "010-1234-5678", level: "초급" },
    });
  });

  it("금액 범위 (P19-2): 강사 지급액 1원~1,000만 원, 손님 강습료 0원~1,000만 원, 소수·음수는 숫자 아님", () => {
    const err = (f: Record<string, string>) => {
      const r = parseJob(form({ ...base, ...f }), [8], NOW);
      return r.ok ? null : r.errors;
    };
    expect(err({ instructor_rate: "0" })?.instructorRate).toBe("강사 지급액은 1원 이상 1,000만 원 이하로 입력해 주세요.");
    expect(err({ instructor_rate: "99999999999" })?.instructorRate).toBe("강사 지급액은 1원 이상 1,000만 원 이하로 입력해 주세요.");
    expect(err({ instructor_rate: "10,000,000" })).toBeNull();
    expect(err({ instructor_rate: "1.5" })?.instructorRate).toBe("강사 지급액은 숫자로 입력해 주세요.");
    expect(err({ instructor_rate: "-100" })?.instructorRate).toBe("강사 지급액은 숫자로 입력해 주세요.");
    expect(err({ customer_price: "0" })).toBeNull();
    expect(err({ customer_price: "10000001" })?.customerPrice).toBe("손님 강습료는 0원 이상 1,000만 원 이하로 입력해 주세요.");
  });

  it("자정을 넘는 강습 (P19-3): 끝이 시작보다 이르면 다음 날, 12시간 넘으면 잘못 입력", () => {
    const r = parseJob(form({ ...base, date: "2026-12-31", start: "22:00", end: "01:00" }), [8], NOW);
    expect(r.ok && [r.data.startsAt, r.data.endsAt]).toEqual(["2026-12-31T22:00:00+09:00", "2027-01-01T01:00:00+09:00"]);
    const long = parseJob(form({ ...base, end: "09:00" }), [8], NOW); // 10:00 → 다음 날 09:00 = 23시간
    expect(!long.ok && long.errors.end).toBe("강습은 12시간을 넘을 수 없습니다. 끝나는 시간을 확인해 주세요.");
    const same = parseJob(form({ ...base, end: "10:00" }), [8], NOW);
    expect(!same.ok && same.errors.end).toBe("끝나는 시간은 시작과 달라야 합니다.");
  });

  it("지난 시간 강습은 막는다 (P19-3), 지금 막 시작한 10분 안은 허용", () => {
    const at = (d: string, s: string, now: number) => parseJob(form({ ...base, date: d, start: s, end: "12:00" }), [8], now);
    const past = at("2026-11-30", "10:00", NOW);
    expect(!past.ok && past.errors.start).toBe("지난 시간에는 강습을 등록할 수 없습니다. 날짜와 시작 시간을 확인해 주세요.");
    expect(at("2026-12-01", "10:00", Date.parse("2026-12-01T10:05:00+09:00")).ok).toBe(true);
    expect(at("2026-12-01", "10:00", Date.parse("2026-12-01T10:20:00+09:00")).ok).toBe(false);
  });

  it("강습 유형에 맞는 인원 (1:1은 1명, 1:2는 2명, 그룹은 3~10명)", () => {
    expect(parseJob(form({ ...base, lesson_type: "private", student_count: "2" }), [8], NOW).ok).toBe(false);
    expect(parseJob(form({ ...base, lesson_type: "group", student_count: "2" }), [8], NOW).ok).toBe(false);
    expect(parseJob(form({ ...base, lesson_type: "group", student_count: "5" }), [8], NOW).ok).toBe(true);
  });

  it("영업 스키장이 아니면 막는다", () => {
    expect(parseJob(form({ ...base, resort_id: "1" }), [8], NOW).ok).toBe(false);
  });

  it("기존 손님을 고르면 새 손님 입력은 무시한다", () => {
    const r = parseJob(form({ ...base, customer_id: "30000000-0000-0000-0000-000000000001" }), [8], NOW);
    expect(r.ok && [r.data.customerId, r.data.newCustomer]).toEqual(["30000000-0000-0000-0000-000000000001", null]);
  });

  it("금액은 숫자만, 비워도 된다", () => {
    expect(parseJob(form({ ...base, customer_price: "", instructor_rate: "" }), [8], NOW).ok).toBe(true);
    expect(parseJob(form({ ...base, customer_price: "십만원" }), [8], NOW).ok).toBe(false);
  });
});
