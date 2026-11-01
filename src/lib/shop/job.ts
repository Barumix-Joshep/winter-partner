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
  newCustomer: { name: string; phone: string | null; level: string | null; privacy_consent: boolean } | null;
};

type Field = "resortId" | "sportId" | "date" | "start" | "end" | "studentCount" | "customerPrice" | "instructorRate" | "customer";
type Result = { ok: true; data: JobInput } | { ok: false; errors: Partial<Record<Field, string>> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function won(raw: string): number | null | undefined {
  const s = raw.replace(/,/g, "");
  if (!s) return null;
  return /^\d+$/.test(s) ? Number(s) : undefined; // undefined = 잘못된 값
}

export function parseJob(fd: FormData, shopResortIds: number[]): Result {
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
  else if (end <= start) errors.end = "끝나는 시간은 시작보다 늦어야 합니다.";
  const range = LESSON_TYPES[lessonType];
  if (!Number.isInteger(studentCount) || studentCount < range.min || studentCount > range.max) {
    errors.studentCount = `${range.label} 강습은 ${range.min === range.max ? `${range.min}명` : `${range.min}~${range.max}명`}입니다.`;
  }
  if (customerPrice === undefined) errors.customerPrice = "손님 강습료는 숫자로 입력해 주세요.";
  if (instructorRate === undefined) errors.instructorRate = "강사 지급액은 숫자로 입력해 주세요.";
  if (customerId && !UUID.test(customerId)) errors.customer = "손님을 다시 골라 주세요.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      resortId,
      sportId,
      startsAt: `${date}T${start}:00+09:00`,
      endsAt: `${date}T${end}:00+09:00`,
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
              privacy_consent: fd.get("new_customer_privacy_consent") === "on",
            }
          : null,
    },
  };
}
