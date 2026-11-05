// 연락처 가리기 (보안 11). 목록처럼 여러 손님이 한 화면에 보이는 곳에서 쓴다.
// 전체 번호는 손님 상세(열람 기록 customer_view가 남는다)와 실제로 연락해야 하는 화면(강습 상세·재방문 안내)에서만.
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  if (d.length < 8) return "****";
  const head = d.startsWith("02") ? "02" : d.slice(0, 3);
  return `${head}-****-${d.slice(-4)}`;
}
