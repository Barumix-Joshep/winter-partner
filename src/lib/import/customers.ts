// 손님 CSV 일괄 등록 확인 (P16-4). 화면 미리보기와 서버 저장이 같은 함수를 쓴다.
import { parseCustomer, normalizePhone, type CustomerInput } from "@/lib/customer/validate";
import { detectHealthTerms } from "@/lib/privacy/health";

export const MAX_ROWS = 500;

// 양식: 열 이름 + [테스트] 예시 한 줄 (실제 개인정보가 아니다)
export const CUSTOMER_TEMPLATE: string[][] = [
  ["이름", "휴대폰", "출생연도", "보호자 이름", "보호자 휴대폰", "레벨", "장비 사이즈", "태그", "메모"],
  ["[테스트] 김손님", "010-0000-1234", "1990", "", "", "초급", "250", "#재방문", "오전 선호"],
];

// 열 이름 → 손님 카드 폼 필드
const FIELDS: Record<string, string> = {
  이름: "name", name: "name",
  휴대폰: "phone", 연락처: "phone", 전화번호: "phone", phone: "phone",
  출생연도: "birth_year", 생년: "birth_year", birth_year: "birth_year",
  "보호자 이름": "guardian_name", 보호자: "guardian_name", guardian_name: "guardian_name",
  "보호자 휴대폰": "guardian_phone", "보호자 연락처": "guardian_phone", guardian_phone: "guardian_phone",
  레벨: "level", level: "level",
  "장비 사이즈": "equipment_size", 사이즈: "equipment_size", equipment_size: "equipment_size",
  태그: "tags", tags: "tags",
  메모: "memo", memo: "memo",
};

const MESSAGES: Partial<Record<keyof CustomerInput, string>> = {
  phone: "연락처 형식을 확인해 주세요 (예: 010-1234-5678)",
};

export type CustomerRow = { line: number; values: Record<string, string>; data?: CustomerInput; errors: string[]; skip?: string };
export type CustomerCheck = { rows: CustomerRow[]; okCount: number; fileError?: string };

// 같은 사람인지 볼 열쇠: 휴대폰, 없으면 이름+보호자 휴대폰
const dupKey = (d: CustomerInput) => d.phone ?? (d.guardian_phone ? `${d.name}|${d.guardian_phone}` : null);

export function checkCustomerRows(table: string[][], existingPhones: Set<string>, nowYear: number): CustomerCheck {
  const [header = [], ...body] = table;
  const cols = header.map((h) => FIELDS[h.trim()] ?? FIELDS[h.trim().toLowerCase()] ?? null);
  if (!cols.includes("name")) return { rows: [], okCount: 0, fileError: "첫 줄에 '이름' 열이 있어야 합니다. 양식을 내려받아 써 주세요." };
  if (body.length > MAX_ROWS) return { rows: [], okCount: 0, fileError: `한 번에 ${MAX_ROWS}명까지 올릴 수 있습니다. 파일을 나눠 주세요.` };

  const existing = new Set([...existingPhones].map((p) => normalizePhone(p) ?? p));
  const seen = new Map<string, number>();
  const rows = body.map((cells, i): CustomerRow => {
    const line = i + 2;
    const values: Record<string, string> = {};
    cols.forEach((c, j) => {
      if (c) values[c] = cells[j] ?? "";
    });
    const fd = new FormData();
    Object.entries(values).forEach(([k, v]) => fd.set(k, v));
    const parsed = parseCustomer(fd, nowYear);
    if (!parsed.ok) {
      const errors = Object.entries(parsed.errors).map(([k, v]) => MESSAGES[k as keyof CustomerInput] ?? v ?? "");
      return { line, values, errors };
    }
    const health = detectHealthTerms(parsed.data.memo);
    if (health.length) {
      return { line, values, errors: [`메모에 건강 정보로 보이는 말(${health.join(", ")})이 있습니다. 메모에서 빼고 다시 올려 주세요.`] };
    }
    const key = dupKey(parsed.data);
    if (key && seen.has(key)) return { line, values, data: parsed.data, errors: [], skip: `파일 안에서 ${seen.get(key)}행과 같은 연락처` };
    if (parsed.data.phone && existing.has(parsed.data.phone)) return { line, values, data: parsed.data, errors: [], skip: "이미 등록된 연락처" };
    if (key) seen.set(key, line);
    return { line, values, data: parsed.data, errors: [] };
  });
  return { rows, okCount: rows.filter((r) => r.data && !r.skip && r.errors.length === 0).length };
}
