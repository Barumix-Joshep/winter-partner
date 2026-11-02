import { describe, expect, it } from "vitest";
import { intakeSystem, normalizeIntake, parseIntake } from "./intake";
import { mockExtractIntake } from "./intake-mock";
import fixtures from "./__fixtures__/intake-samples.json";

const SPORTS = ["스키", "스노보드"];

describe("parseIntake", () => {
  it("형식에 맞는 값만 받는다", () => {
    const r = parseIntake(
      { date: "2026-12-20", start: "10:00", end: "25:00", sport: "썰매", lesson_type: "semi", student_count: 2, level: "초급", note: "처음", patch_paid_by: "shop", customer_name: "손님A", uncertain: ["end", 3] },
      SPORTS,
    );
    expect(r).toEqual({
      date: "2026-12-20", start: "10:00", end: null, sport: null, lessonType: "semi", studentCount: 2, level: "초급", note: "처음", patchPaidBy: "shop", customerName: "손님A", uncertain: ["end"],
    });
  });
  it("객체가 아니면 null", () => {
    expect(parseIntake(null, SPORTS)).toBeNull();
    expect(parseIntake("x", SPORTS)).toBeNull();
  });
  it("인원 범위 밖은 버린다", () => {
    expect(parseIntake({ student_count: 40 }, SPORTS)?.studentCount).toBeNull();
  });
});

describe("normalizeIntake", () => {
  const empty = { date: null, start: null, end: null, sport: null, lessonType: null, studentCount: null, level: null, note: null, patchPaidBy: null, customerName: null, uncertain: [] };
  it("끝 시각이 없으면 2시간", () => expect(normalizeIntake({ ...empty, start: "13:30" }).end).toBe("15:30"));
  it("인원으로 유형", () => expect(normalizeIntake({ ...empty, studentCount: 4 }).lessonType).toBe("group"));
  it("유형으로 인원", () => expect(normalizeIntake({ ...empty, lessonType: "semi" }).studentCount).toBe(2));
});

describe("intakeSystem", () => {
  it("오늘 날짜·요일·종목을 넣는다", () => {
    const s = intakeSystem("2026-12-01", SPORTS, ["하이원"]);
    expect(s).toContain("2026-12-01 (화요일");
    expect(s).toContain("스키, 스노보드");
  });
});

describe("평가 세트", () => {
  it("가상 샘플 20개 (실제 접수 문자로 교체 필요)", () => {
    expect(fixtures.samples).toHaveLength(20);
  });
  it("목 추출기는 절대 날짜 샘플의 기본 칸을 채운다 (E2E용)", () => {
    const r = normalizeIntake(parseIntake(mockExtractIntake(intakeSystem(fixtures.today, SPORTS, []), "12/20 10시 스키 1:2 형제 둘 다 처음"), SPORTS)!);
    expect(r).toMatchObject({ date: "2026-12-20", start: "10:00", end: "12:00", sport: "스키", lessonType: "semi", studentCount: 2 });
  });
});
