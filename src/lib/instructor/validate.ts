// 강사 프로필 폼 검증
import { ids, text } from "@/lib/form";

export type InstructorProfileInput = {
  level: string | null;
  bio: string | null;
  baseRate: number | null;
  sportIds: number[];
  resortIds: number[];
};

type Result =
  | { ok: true; data: InstructorProfileInput }
  | { ok: false; errors: Partial<Record<keyof InstructorProfileInput, string>> };

export const BIO_MAX = 500;

export function parseInstructorProfile(fd: FormData): Result {
  const level = text(fd, "level") || null;
  const bio = text(fd, "bio") || null;
  const rawRate = text(fd, "base_rate").replace(/,/g, "");
  const sportIds = ids(fd, "sport_ids");
  const resortIds = ids(fd, "resort_ids");
  const errors: Partial<Record<keyof InstructorProfileInput, string>> = {};

  let baseRate: number | null = null;
  if (rawRate) {
    if (/^\d+$/.test(rawRate)) baseRate = Number(rawRate);
    else errors.baseRate = "기본 강습료는 숫자로 입력해 주세요 (예: 80000).";
  }
  if (bio && bio.length > BIO_MAX) errors.bio = `소개는 ${BIO_MAX}자까지 쓸 수 있습니다.`;
  if (!sportIds?.length) errors.sportIds = "종목을 하나 이상 골라 주세요.";
  if (!resortIds?.length) errors.resortIds = "활동 스키장을 하나 이상 골라 주세요.";

  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, data: { level, bio, baseRate, sportIds: sportIds!, resortIds: resortIds! } };
}
