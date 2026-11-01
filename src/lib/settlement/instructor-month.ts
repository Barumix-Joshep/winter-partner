// 강사 정산 화면: 한 달 샵별 요약 (프로토타입 IPay)
import { withholding } from "./withholding";

type Lesson = { amount: number; status: string; shop: { id: string; name: string } };
type Settlement = { id: string; shopId: string; gross: number; withholding: number; net: number; status: string };

const STATE: Record<string, string> = { draft: "집계됨", issued: "지급 대기", paid: "지급 완료" };

// 정산서가 있으면 그 금액을, 없으면 승인 강습으로 예상치를 쓴다 (원천세는 샵별로 계산)
export function instructorMonth(lessons: Lesson[], settlements: Settlement[]) {
  const byShop = new Map<string, { name: string; approved: number[]; pending: number }>();
  for (const l of lessons) {
    if (l.status === "canceled") continue;
    const s = byShop.get(l.shop.id) ?? { name: l.shop.name, approved: [], pending: 0 };
    if (l.status === "approved") s.approved.push(l.amount);
    else s.pending += 1;
    byShop.set(l.shop.id, s);
  }
  const shops = [...byShop.entries()]
    .filter(([, s]) => s.approved.length > 0 || s.pending > 0)
    .map(([shopId, s]) => {
      const st = settlements.find((x) => x.shopId === shopId);
      const gross = st?.gross ?? s.approved.reduce((a, b) => a + b, 0);
      const wh = st?.withholding ?? withholding(gross).total;
      return {
        shopId,
        name: s.name,
        count: s.approved.length,
        gross,
        net: st?.net ?? gross - wh,
        state: st ? (STATE[st.status] ?? st.status) : "집계 전",
        settlementId: st?.id ?? null,
        pending: s.pending,
        wh,
      };
    })
    .sort((a, b) => b.gross - a.gross);
  const total = shops.reduce(
    (t, s) => ({ approvedCount: t.approvedCount + s.count, gross: t.gross + s.gross, withholding: t.withholding + s.wh, net: t.net + s.net }),
    { approvedCount: 0, gross: 0, withholding: 0, net: 0 },
  );
  return {
    total,
    shops: shops.map((s) => ({
      shopId: s.shopId,
      name: s.name,
      count: s.count,
      gross: s.gross,
      net: s.net,
      state: s.state,
      settlementId: s.settlementId,
      pending: s.pending,
    })),
  };
}
