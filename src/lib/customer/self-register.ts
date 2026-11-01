// 손님 셀프 등록 입력 검증 (공개 페이지, 서버에서 다시 확인)
import { normalizePhone } from "./validate";
import { isMinor, parseBirthYear } from "./minor";

export type SelfRegisterInput = {
  name: string;
  phone: string | null;
  birthYear: number | null;
  level: string | null;
  equipmentSize: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  marketing: boolean;
  photo: boolean;
};

const t = (fd: FormData, k: string, max: number) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
};

export function parseSelfRegister(fd: FormData, nowYear: number): { ok: true; data: SelfRegisterInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const name = t(fd, "name", 40);
  const phone = normalizePhone(t(fd, "phone", 20));
  const guardianPhone = normalizePhone(t(fd, "guardian_phone", 20));
  const guardianName = t(fd, "guardian_name", 40);
  const birthYear = parseBirthYear(t(fd, "birth_year", 4), nowYear);
  if (!name) errors.name = "이름을 입력해 주세요.";
  if (phone === undefined) errors.phone = "휴대폰 번호를 확인해 주세요.";
  if (guardianPhone === undefined) errors.guardian_phone = "보호자 휴대폰 번호를 확인해 주세요.";
  if (birthYear === undefined) errors.birth_year = "출생 연도를 네 자리로 입력해 주세요.";
  const minor = isMinor(birthYear, nowYear);
  if (minor) {
    if (!guardianName) errors.guardian_name = "14세 미만은 보호자 이름이 필요합니다.";
    if (!guardianPhone) errors.guardian_phone ??= "14세 미만은 보호자 휴대폰 번호가 필요합니다.";
    if (fd.get("guardian_confirm") !== "on") errors.guardian_confirm = "보호자께서 직접 입력해 주세요.";
  } else if (!phone && !guardianPhone) {
    errors.phone = "휴대폰 번호를 입력해 주세요.";
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      name,
      phone: phone ?? null,
      birthYear: birthYear ?? null,
      level: t(fd, "level", 40) || null,
      equipmentSize: t(fd, "equipment_size", 80) || null,
      guardianName: guardianName || null,
      guardianPhone: guardianPhone ?? null,
      marketing: fd.get("marketing") === "on",
      photo: fd.get("photo") === "on",
    },
  };
}
