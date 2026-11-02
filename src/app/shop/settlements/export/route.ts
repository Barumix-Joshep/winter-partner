import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shop/my-shop";
import { buildStatement, SETTLEMENT_SELECT, type SettlementRow } from "@/lib/settlement/statement";
import { renderMonthXlsx } from "@/lib/settlement/xlsx";
import { attachment } from "@/lib/settlement/download";
import { logAccess } from "@/lib/audit";

// 샵의 한 달 정산 Excel (요약 + 강습 내역)
export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return new NextResponse("월을 확인해 주세요", { status: 400 });
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return new NextResponse("로그인이 필요합니다", { status: 401 });
  const shop = await getMyShop(uid);
  if (!shop) return new NextResponse("샵 관리자만 내려받을 수 있습니다", { status: 403 });

  const { data } = await supabase.from("settlements").select(SETTLEMENT_SELECT).eq("shop_id", shop.id).eq("month", `${month}-01`);
  const statements = ((data ?? []) as unknown as SettlementRow[]).map(buildStatement).sort((a, b) => b.gross - a.gross);
  const xlsx = await renderMonthXlsx(month, shop.name, statements);
  await logAccess("settlement_export", shop.id, null, { month, rows: statements.length });
  return new NextResponse(new Uint8Array(xlsx), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": attachment(`${shop.name}_정산_${month}.xlsx`, `settlements_${month}.xlsx`),
      "Cache-Control": "private, no-store",
    },
  });
}
