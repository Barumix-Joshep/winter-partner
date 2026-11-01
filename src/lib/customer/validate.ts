// 손님 카드 폼 검증 (샵 관리자만 쓴다. 연락처는 샵만 본다)
import { text } from "@/lib/form";

// null: 비움, undefined: 잘못된 번호
export function normalizePhone(raw: string): string | null | undefined {
  const d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (/^01\d{8,9}$/.test(d)) return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (/^0\d{8,10}$/.test(d)) return raw.trim(); // 지역번호는 입력 그대로
  return undefined;
}

export function parseTags(raw: string) {
  return [...new Set(raw.split(/[#,\s]+/).map((t) => t.trim()).filter(Boolean))].slice(0, 10);
}

export type CustomerInput = {
  name: string;
  phone: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  level: string | null;
  equipment_size: string | null;
  tags: string[];
  memo: string | null;
  next_contact_on: string | null;
  marketing_consent: boolean;
  privacy_consent: boolean; // 개인정보 수집·이용 및 담당 강사 제공 동의 (저장 시 privacy_consent_at으로)
};

type Result = { ok: true; data: CustomerInput } | { ok: false; errors: Partial<Record<keyof CustomerInput, string>> };

export function parseCustomer(fd: FormData): Result {
  const errors: Partial<Record<keyof CustomerInput, string>> = {};
  const name = text(fd, "name");
  const phone = normalizePhone(text(fd, "phone"));
  const guardianPhone = normalizePhone(text(fd, "guardian_phone"));
  const next = text(fd, "next_contact_on");
  const memo = text(fd, "memo");

  if (!name) errors.name = "이름을 입력해 주세요.";
  if (phone === undefined) errors.phone = "연락처를 확인해 주세요.";
  if (guardianPhone === undefined) errors.guardian_phone = "보호자 연락처를 확인해 주세요.";
  if (next && !/^\d{4}-\d{2}-\d{2}$/.test(next)) errors.next_contact_on = "날짜를 골라 주세요.";
  if (memo.length > 2000) errors.memo = "메모는 2,000자까지입니다.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      name,
      phone: phone ?? null,
      guardian_name: text(fd, "guardian_name") || null,
      guardian_phone: guardianPhone ?? null,
      level: text(fd, "level") || null,
      equipment_size: text(fd, "equipment_size") || null,
      tags: parseTags(text(fd, "tags")),
      memo: memo || null,
      next_contact_on: next || null,
      marketing_consent: fd.get("marketing_consent") === "on",
      privacy_consent: fd.get("privacy_consent") === "on",
    },
  };
}
