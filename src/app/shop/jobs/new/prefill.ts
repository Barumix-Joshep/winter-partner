import type { LessonType, PatchPaidBy } from "@/lib/shop/job";

// AI 접수 자동 입력이 채워 줄 칸 (모두 제안값, 저장 검증은 parseJob 그대로)
export type JobPrefill = {
  resortId: number | null;
  sportId: number | null;
  date: string | null;
  start: string | null;
  end: string | null;
  lessonType: LessonType | null;
  studentCount: number | null;
  level: string | null;
  note: string | null;
  patchPaidBy: PatchPaidBy | null;
  customerId: string | null;
  newCustomerName: string | null;
  uncertain: string[];
};
