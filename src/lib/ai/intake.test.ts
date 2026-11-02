import { describe, expect, it } from "vitest";
import { calendar, intakeSystem, normalizeIntake, parseIntake } from "./intake";
import { mockExtractIntake } from "./intake-mock";
import fixtures from "./__fixtures__/intake-samples.json";

const SPORTS = ["스키", "스노우보드", "스노우스케이트"];

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

describe("날짜 보정", () => {
  const empty = { date: null, start: null, end: null, sport: null, lessonType: null, studentCount: null, level: null, note: null, patchPaidBy: null, customerName: null, uncertain: [] };
  it("지난 날짜는 다음 해로", () => {
    expect(normalizeIntake({ ...empty, date: "2026-01-10" }, "2026-11-02").date).toBe("2027-01-10");
    expect(normalizeIntake({ ...empty, date: "2026-12-20" }, "2026-11-02").date).toBe("2026-12-20");
  });
  it("달력: 이번 주·다음 주(월~일)", () => {
    const c = calendar("2026-11-02");
    expect(c).toContain("2026-11-02 월 (이번 주, 오늘)");
    expect(c).toContain("2026-11-08 일 (이번 주)");
    expect(c).toContain("2026-11-09 월 (다음 주)");
    expect(c).toContain("2026-11-15 일 (다음 주)");
  });
});

describe("intakeSystem", () => {
  it("오늘 날짜·요일·종목을 넣는다", () => {
    const s = intakeSystem("2026-12-01", SPORTS, ["하이원"]);
    expect(s).toContain("2026-12-01 (화요일");
    expect(s).toContain("스키, 스노우보드, 스노우스케이트");
    expect(s).toMatch(/보드.*스노우보드/);
    expect(s).toMatch(/스노스케이트.*스노우스케이트/);
  });
});

describe("종목 표기 변형 (P17)", () => {
  const base = { date: null, start: null, end: null, lesson_type: null, student_count: null, level: null, note: null, patch_paid_by: null, customer_name: null, uncertain: [] };
  it.each(["보드", "스노 보드", "snowboard", "스노보드"])("모델이 %s로 줘도 스노우보드", (v) => {
    expect(parseIntake({ ...base, sport: v }, SPORTS)?.sport).toBe("스노우보드");
  });
  it.each(["스노스케이트", "스노우 스케이트"])("모델이 %s로 줘도 스노우스케이트", (v) => {
    expect(parseIntake({ ...base, sport: v }, SPORTS)?.sport).toBe("스노우스케이트");
  });
  it("목 추출기: 토요일 스노우보드 초급 2명", () => {
    const r = parseIntake(mockExtractIntake(intakeSystem(fixtures.today, SPORTS, []), "토요일 스노우보드 초급 2명"), SPORTS)!;
    expect(r).toMatchObject({ sport: "스노우보드", studentCount: 2, level: "초급" });
  });
  it("목 추출기: 스노 스케이트", () => {
    expect(parseIntake(mockExtractIntake("", "12/20 스노 스케이트 체험 3명"), SPORTS)?.sport).toBe("스노우스케이트");
  });
});

describe("평가 세트", () => {
  it("가상 샘플: 기존 20개 + P17 스노우보드·스노우스케이트 각 3개 이상", () => {
    expect(fixtures.samples.length).toBeGreaterThanOrEqual(26);
    expect(fixtures.samples.filter((x) => x.expected.sport === "스노우보드").length).toBeGreaterThanOrEqual(3);
    expect(fixtures.samples.filter((x) => x.expected.sport === "스노우스케이트").length).toBeGreaterThanOrEqual(3);
  });
  it("목 추출기는 절대 날짜 샘플의 기본 칸을 채운다 (E2E용)", () => {
    const r = normalizeIntake(parseIntake(mockExtractIntake(intakeSystem(fixtures.today, SPORTS, []), "12/20 10시 스키 1:2 형제 둘 다 처음"), SPORTS)!);
    expect(r).toMatchObject({ date: "2026-12-20", start: "10:00", end: "12:00", sport: "스키", lessonType: "semi", studentCount: 2 });
  });
});
