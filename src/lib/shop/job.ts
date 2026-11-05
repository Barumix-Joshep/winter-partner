// 강습 등록 폼 검증
import { text } from "@/lib/form";

export type LessonType = "private" | "semi" | "group";
export type PatchPaidBy = "shop" | "instructor" | "customer";

export const LESSON_TYPES: Record<LessonType, { label: string; min: number; max: number }> = {
  private: { label: "1:1", min: 1, max: 1 },
  semi: { label: "1:2", min: 2, max: 2 },
  group: { label: "그룹 (3~10명)", min: 3, max: 10 },
};
export const PATCH_PAID_BY: Record<PatchPaidBy, string> = {
  shop: "샵에서 구매",
  instructor: "강사가 구매",
  customer: "손님이 구매",
};

export type JobInput = {
  resortId: number;
  sportId: number;
  startsAt: string;
  endsAt: string;
  lessonType: LessonType;
  studentCount: number;
  customerPrice: number | null;
  instructorRate: number | null;
  patchPaidBy: PatchPaidBy | null;
  note: string | null;
  customerId: string | null;
  newCustomer: { name: string; phone: string | null; level: string | null } | null;
};

type Field = "resortId" | "sportId" | "date" | "start" | "end" | "studentCount" | "customerPrice" | "instructorRate" | "customer";
type Result = { ok: true; data: JobInput } | { ok: false; errors: Partial<Record<Field, string>> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// 금액 상한 (DB private.check_won과 같다)
export const MAX_WON = 10_000_000;
export const wonRangeError = (n: number, label: string, min = 1) =>
  n < min || n > MAX_WON ? `${label} ${min}원 이상 1,000만 원 이하로 입력해 주세요.` : null;

function won(raw: string): number | null | undefined {
  const s = raw.replace(/,/g, "");
  if (!s) return null;
  return /^\d+$/.test(s) ? Number(s) : undefined; // undefined = 잘못된 값
}

// 자정을 넘는 강습: 끝 시각이 시작보다 이르면 다음 날로 본다. 12시간을 넘으면 잘못 입력한 것으로 본다.
// 일정 충돌과 정산 월은 시작 시각 기준이다(1/31 23:00~2/1 01:00 강습은 1월 정산).
const MAX_LESSON_MS = 12 * 3600_000;
// 지난 시간 등록을 막을 때 봐주는 여유 (지금 막 시작한 강습을 늦게 입력하는 경우)
const PAST_GRACE_MS = 10 * 60_000;

export function parseJob(fd: FormData, shopResortIds: number[], now = Date.now()): Result {
  const errors: Partial<Record<Field, string>> = {};
  const resortId = Number(text(fd, "resort_id"));
  const sportId = Number(text(fd, "sport_id"));
  const date = text(fd, "date");
  const start = text(fd, "start");
  const end = text(fd, "end");
  const lessonType = (text(fd, "lesson_type") in LESSON_TYPES ? text(fd, "lesson_type") : "private") as LessonType;
  const studentCount = Number(text(fd, "student_count") || LESSON_TYPES[lessonType].min);
  const customerPrice = won(text(fd, "customer_price"));
  const instructorRate = won(text(fd, "instructor_rate"));
  const patch = text(fd, "patch_paid_by");
  const customerId = text(fd, "customer_id");
  const newName = text(fd, "new_customer_name");

  if (!shopResortIds.includes(resortId)) errors.resortId = "영업 스키장을 골라 주세요.";
  if (!Number.isInteger(sportId) || sportId <= 0) errors.sportId = "종목을 골라 주세요.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.date = "날짜를 골라 주세요.";
  if (!/^\d{2}:\d{2}$/.test(start)) errors.start = "시작 시간을 골라 주세요.";
  if (!/^\d{2}:\d{2}$/.test(end)) errors.end = "끝나는 시간을 골라 주세요.";
  else if (end === start) errors.end = "끝나는 시간은 시작과 달라야 합니다.";
  let startsAt = "";
  let endsAt = "";
  if (!errors.date && !errors.start && !errors.end) {
    const s0 = new Date(`${date}T${start}:00+09:00`).getTime();
    let e0 = new Date(`${date}T${end}:00+09:00`).getTime();
    if (e0 <= s0) e0 += 86400_000; // 자정 넘김
    if (Number.isNaN(s0)) errors.date = "날짜를 골라 주세요.";
    else if (e0 - s0 > MAX_LESSON_MS) errors.end = "강습은 12시간을 넘을 수 없습니다. 끝나는 시간을 확인해 주세요.";
    else if (s0 < now - PAST_GRACE_MS) errors.start = "지난 시간에는 강습을 등록할 수 없습니다. 날짜와 시작 시간을 확인해 주세요.";
    startsAt = `${date}T${start}:00+09:00`;
    endsAt = `${new Date(e0 + 9 * 3600_000).toISOString().slice(0, 10)}T${end}:00+09:00`;
  }
  const range = LESSON_TYPES[lessonType];
  if (!Number.isInteger(studentCount) || studentCount < range.min || studentCount > range.max) {
    errors.studentCount = `${range.label} 강습은 ${range.min === range.max ? `${range.min}명` : `${range.min}~${range.max}명`}입니다.`;
  }
  if (customerPrice === undefined) errors.customerPrice = "손님 강습료는 숫자로 입력해 주세요.";
  else if (customerPrice !== null) {
    const e = wonRangeError(customerPrice, "손님 강습료는", 0);
    if (e) errors.customerPrice = e;
  }
  if (instructorRate === undefined) errors.instructorRate = "강사 지급액은 숫자로 입력해 주세요.";
  else if (instructorRate !== null) {
    const e = wonRangeError(instructorRate, "강사 지급액은");
    if (e) errors.instructorRate = e;
  }
  if (customerId && !UUID.test(customerId)) errors.customer = "손님을 다시 골라 주세요.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      resortId,
      sportId,
      startsAt,
      endsAt,
      lessonType,
      studentCount,
      customerPrice: customerPrice ?? null,
      instructorRate: instructorRate ?? null,
      patchPaidBy: patch in PATCH_PAID_BY ? (patch as PatchPaidBy) : null,
      note: text(fd, "note") || null,
      customerId: customerId || null,
      newCustomer:
        !customerId && newName
          ? {
              name: newName,
              phone: text(fd, "new_customer_phone") || null,
              level: text(fd, "new_customer_level") || null,
            }
          : null,
    },
  };
}
