// D1 자격증 판독: 이미지에서 발급처·등급·성명·날짜·자격번호 끝자리를 뽑고, 강사 입력값·프로필 이름과 비교한다.
// 판독값은 참고용이고 승인은 본사가 한다.
export type CertExtract = {
  issuer: string | null;
  grade: string | null;
  holderName: string | null;
  issuedOn: string | null; // YYYY-MM-DD
  expiresOn: string | null;
  numberLast4: string | null;
  readable: boolean;
};

export const CERT_TOOL = "read_certificate";
export const CERT_SYSTEM =
  "너는 스키·스노우보드·스노우스케이트 강사 자격증 이미지를 읽는다. 보이는 글자만 옮기고 추측하지 않는다. 읽을 수 없으면 readable=false. " +
  "자격번호는 마지막 4자리만 적는다. 날짜는 YYYY-MM-DD.";
export const CERT_SCHEMA = {
  type: "object",
  properties: {
    issuer: { type: ["string", "null"], description: "발급 기관 (예: KSIA, 대한스키지도자연맹, CASI)" },
    grade: { type: ["string", "null"], description: "등급 (예: Level 2, 2급)" },
    holder_name: { type: ["string", "null"], description: "자격증에 적힌 성명" },
    issued_on: { type: ["string", "null"] },
    expires_on: { type: ["string", "null"] },
    number_last4: { type: ["string", "null"], description: "자격번호 마지막 4자리" },
    readable: { type: "boolean" },
  },
  required: ["issuer", "grade", "holder_name", "issued_on", "expires_on", "number_last4", "readable"],
} as const;

const s = (v: unknown, max = 60) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const day = (v: unknown) => {
  const x = s(v, 10);
  return x && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null;
};

export function parseCertExtract(input: unknown): CertExtract | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (typeof o.readable !== "boolean") return null;
  const last4 = s(o.number_last4, 40);
  return {
    issuer: s(o.issuer),
    grade: s(o.grade),
    holderName: s(o.holder_name, 40),
    issuedOn: day(o.issued_on),
    expiresOn: day(o.expires_on),
    numberLast4: last4 ? last4.replace(/\D/g, "").slice(-4) || null : null,
    readable: o.readable,
  };
}

// DB(ai_extract)에는 모델 출력과 같은 모양으로 저장한다 → 읽을 때 parseCertExtract로 다시 검증
export function toStoredExtract(ex: CertExtract) {
  return {
    issuer: ex.issuer,
    grade: ex.grade,
    holder_name: ex.holderName,
    issued_on: ex.issuedOn,
    expires_on: ex.expiresOn,
    number_last4: ex.numberLast4,
    readable: ex.readable,
  };
}

// 비교용 정규화: 대소문자·공백·"레벨/Level"·"급" 표기 차이 무시
export function norm(v: string | null | undefined) {
  return (v ?? "").toLowerCase().replace(/\s+/g, "").replace(/레벨|level|lv\.?/g, "l").replace(/급$/, "");
}

export type CertCheck = { field: "issuer" | "grade" | "holderName" | "expiresOn"; label: string; entered: string | null; read: string | null; ok: boolean };

export function compareCert(entered: { issuer: string; grade: string | null; profileName: string }, ex: CertExtract, today: string): { checks: CertCheck[]; needsReview: boolean } {
  const checks: CertCheck[] = [
    { field: "issuer", label: "발급처", entered: entered.issuer, read: ex.issuer, ok: !!ex.issuer && norm(ex.issuer).includes(norm(entered.issuer)) },
    { field: "grade", label: "등급", entered: entered.grade, read: ex.grade, ok: !!ex.grade && norm(ex.grade) === norm(entered.grade) },
    { field: "holderName", label: "성명", entered: entered.profileName, read: ex.holderName, ok: !!ex.holderName && norm(ex.holderName) === norm(entered.profileName) },
    { field: "expiresOn", label: "유효기간", entered: null, read: ex.expiresOn, ok: !ex.expiresOn || ex.expiresOn >= today },
  ];
  // 성명 불일치·만료·판독 불가는 반드시 사람이 확인
  const needsReview = !ex.readable || !checks.find((c) => c.field === "holderName")!.ok || !checks.find((c) => c.field === "expiresOn")!.ok;
  return { checks, needsReview };
}
