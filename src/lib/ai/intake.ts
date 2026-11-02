// A1 강습 접수 자동 입력: 문자·카톡 접수 글 → 강습 등록 칸 제안 (확정은 사장님이 폼에서)
import type { LessonType, PatchPaidBy } from "@/lib/shop/job";

export type IntakeResult = {
  date: string | null; // YYYY-MM-DD
  start: string | null; // HH:MM
  end: string | null;
  sport: string | null; // 샵이 쓰는 종목 이름 중 하나
  lessonType: LessonType | null;
  studentCount: number | null;
  level: string | null;
  note: string | null;
  patchPaidBy: PatchPaidBy | null;
  customerName: string | null;
  uncertain: string[]; // 확신 없는 칸 (노란 테두리)
};

export const INTAKE_TOOL = "extract_lesson_request";

export const INTAKE_SCHEMA = {
  type: "object",
  properties: {
    date: { type: ["string", "null"], description: "강습 날짜 YYYY-MM-DD. 상대 날짜는 오늘 기준으로 계산" },
    start: { type: ["string", "null"], description: "시작 시각 HH:MM (24시간)" },
    end: { type: ["string", "null"], description: "끝 시각 HH:MM. 없으면 시작+2시간" },
    sport: { type: ["string", "null"], description: "종목. 주어진 목록 중 하나" },
    lesson_type: { type: ["string", "null"], enum: ["private", "semi", "group", null], description: "1:1=private, 1:2=semi, 3명 이상=group" },
    student_count: { type: ["integer", "null"] },
    level: { type: ["string", "null"], description: "처음/입문/초급/중급/상급 등 글에 적힌 수준" },
    note: { type: ["string", "null"], description: "강사에게 전할 요청 사항 (연락처·건강 정보 제외)" },
    patch_paid_by: { type: ["string", "null"], enum: ["shop", "instructor", "customer", null], description: "강습 허가권(패치) 구매 주체가 언급됐을 때만" },
    customer_name: { type: ["string", "null"], description: "손님 이름이나 손님A 같은 표시. 없으면 null" },
    uncertain: { type: "array", items: { type: "string" }, description: "확신이 없는 필드 이름 목록" },
  },
  required: ["date", "start", "end", "sport", "lesson_type", "student_count", "level", "note", "patch_paid_by", "customer_name", "uncertain"],
} as const;

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

export function intakeSystem(todayKst: string, sports: string[], resorts: string[]) {
  const d = new Date(`${todayKst}T00:00:00Z`);
  return [
    "너는 스키·스노보드 렌탈샵의 강습 접수를 돕는다. 손님이 보낸 문자·카톡 글에서 강습 조건만 뽑아 도구로 돌려준다.",
    `오늘은 ${todayKst} (${WEEKDAY[d.getUTCDay()]}요일, 한국 시간)이다. "이번 주 토요일", "내일" 같은 말은 이 날짜 기준으로 계산한다.`,
    `이 샵의 종목: ${sports.join(", ")}. 영업 스키장: ${resorts.join(", ")}.`,
    "글에 없는 것은 지어내지 말고 null로 둔다. 애매하면 값을 넣되 uncertain에 필드 이름을 적는다.",
    "시간만 있고 길이가 없으면 2시간 강습으로 본다. 오전/오후 표시가 없고 1~7시면 오후로 본다.",
    "연락처·이메일·건강 정보(부상·질환)는 note에 넣지 않는다. [전화] 같은 표시는 무시한다.",
  ].join("\n");
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const str = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

// 모델 출력 검증: 틀린 값은 버린다(null), 형식이 아예 아니면 null 전체
export function parseIntake(input: unknown, sports: string[]): IntakeResult | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const date = str(o.date);
  const start = str(o.start);
  const end = str(o.end);
  const sport = str(o.sport);
  const lt = o.lesson_type;
  const count = typeof o.student_count === "number" && Number.isInteger(o.student_count) && o.student_count > 0 && o.student_count <= 10 ? o.student_count : null;
  const patch = o.patch_paid_by;
  const uncertain = Array.isArray(o.uncertain) ? o.uncertain.filter((x): x is string => typeof x === "string").slice(0, 12) : [];
  return {
    date: date && DATE.test(date) && !Number.isNaN(Date.parse(date)) ? date : null,
    start: start && TIME.test(start) ? start : null,
    end: end && TIME.test(end) ? end : null,
    sport: sport && sports.includes(sport) ? sport : null,
    lessonType: lt === "private" || lt === "semi" || lt === "group" ? lt : null,
    studentCount: count,
    level: str(o.level, 40),
    note: str(o.note, 300),
    patchPaidBy: patch === "shop" || patch === "instructor" || patch === "customer" ? patch : null,
    customerName: str(o.customer_name, 40),
    uncertain,
  };
}

// 추출값끼리 맞추기: 인원으로 유형 보정, 끝 시각 없으면 +2시간
export function normalizeIntake(r: IntakeResult): IntakeResult {
  let { lessonType, studentCount, end } = r;
  if (!lessonType && studentCount) lessonType = studentCount === 1 ? "private" : studentCount === 2 ? "semi" : "group";
  if (lessonType && !studentCount) studentCount = lessonType === "private" ? 1 : lessonType === "semi" ? 2 : null;
  if (r.start && !end) {
    const [h, m] = r.start.split(":").map(Number);
    end = h + 2 <= 23 ? `${String(h + 2).padStart(2, "0")}:${String(m).padStart(2, "0")}` : null;
  }
  return { ...r, lessonType, studentCount, end };
}
