// 사업소득 원천징수 3.3% (소득세 3% + 지방소득세 = 소득세의 10%).
// 각 세액은 10원 미만 절사, 소득세가 1,000원 미만이면 징수하지 않는다(소액부징수).
// DB 함수 private.withholding_amount와 같은 규칙이다 (supabase/migrations/*_settlements.sql).
export function withholding(gross: number, applies = true) {
  if (!applies) return { incomeTax: 0, localTax: 0, total: 0, net: gross };
  let incomeTax = Math.floor((gross * 3) / 100 / 10) * 10;
  if (incomeTax < 1000) incomeTax = 0;
  const localTax = Math.floor(incomeTax / 10 / 10) * 10;
  return { incomeTax, localTax, total: incomeTax + localTax, net: gross - incomeTax - localTax };
}
