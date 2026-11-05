// 지급 방식 (P19-1). DB 참조 표 pay_types와 같은 값이다 (supabase/migrations/*_pay_types.sql).
// 플랫폼은 세무 판단을 하지 않고, 정산서에 어떤 방식으로 지급되는지 기록·표시만 한다.
export const PAY_TYPES = {
  business_3_3: { label: "사업소득 3.3%", withholds: true },
  none_by_shop: { label: "원천징수 샵 별도 처리", withholds: false },
} as const;
export type PayTypeCode = keyof typeof PAY_TYPES;
export const DEFAULT_PAY_TYPE: PayTypeCode = "business_3_3";

export const isPayType = (v: unknown): v is PayTypeCode => typeof v === "string" && v in PAY_TYPES;

// 정산서의 지급 방식: 팀은 사업자 지급, 개인은 저장된 값(없으면 기본 3.3%)
export function payTypeOf(code: string | null | undefined, isTeam: boolean) {
  if (isTeam) return { code: "team" as const, label: "사업자 지급 (원천세 없음)", byShop: false };
  const c = isPayType(code) ? code : DEFAULT_PAY_TYPE;
  return { code: c, label: PAY_TYPES[c].label, byShop: !PAY_TYPES[c].withholds };
}
