// 강사 CSV 일괄 등록 확인 (P16-4). 가입한 강사는 찾아서 전속 초대를 보내고, 아직 가입 안 한 강사는 가입 안내 대상으로 보여 준다.
import { normalizePhone } from "@/lib/customer/validate";

export const MAX_INSTRUCTORS = 300;
export const INSTRUCTOR_TEMPLATE: string[][] = [
  ["이름", "휴대폰", "이메일"],
  ["[테스트] 김강사", "010-0000-5678", "test-instructor@example.com"],
];

const FIELDS: Record<string, "name" | "phone" | "email"> = {
  이름: "name", name: "name", 휴대폰: "phone", 연락처: "phone", 전화번호: "phone", phone: "phone", 이메일: "email", email: "email",
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type InstructorInput = { name: string; phone: string | null; email: string | null };
export type InstructorRow = { line: number; values: Record<string, string>; data?: InstructorInput; errors: string[]; skip?: string };

export function checkInstructorRows(table: string[][]): { rows: InstructorRow[]; fileError?: string } {
  const [header = [], ...body] = table;
  const cols = header.map((h) => FIELDS[h.trim()] ?? FIELDS[h.trim().toLowerCase()] ?? null);
  if (!cols.includes("name")) return { rows: [], fileError: "첫 줄에 '이름' 열이 있어야 합니다. 양식을 내려받아 써 주세요." };
  if (body.length > MAX_INSTRUCTORS) return { rows: [], fileError: `한 번에 ${MAX_INSTRUCTORS}명까지 올릴 수 있습니다. 파일을 나눠 주세요.` };
  const seen = new Map<string, number>();
  const rows = body.map((cells, i): InstructorRow => {
    const line = i + 2;
    const values: Record<string, string> = {};
    cols.forEach((c, j) => {
      if (c) values[c] = (cells[j] ?? "").trim();
    });
    const errors: string[] = [];
    const name = values.name ?? "";
    const phone = normalizePhone(values.phone ?? "");
    const email = (values.email ?? "").toLowerCase() || null;
    if (!name) errors.push("이름을 입력해 주세요.");
    if (phone === undefined) errors.push("휴대폰 형식을 확인해 주세요 (예: 010-1234-5678)");
    if (email && !EMAIL.test(email)) errors.push("이메일 형식을 확인해 주세요.");
    if (!phone && !email && phone !== undefined) errors.push("휴대폰이나 이메일 중 하나는 있어야 찾을 수 있습니다.");
    if (errors.length) return { line, values, errors };
    const data = { name, phone: phone ?? null, email };
    const keys = [data.phone, data.email].filter((k): k is string => !!k);
    const dup = keys.map((k) => seen.get(k)).find((v) => v !== undefined);
    if (dup !== undefined) return { line, values, data, errors: [], skip: `파일 안에서 ${dup}행과 같은 사람` };
    keys.forEach((k) => seen.set(k, line));
    return { line, values, data, errors: [] };
  });
  return { rows };
}
