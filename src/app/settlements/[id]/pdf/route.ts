import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildStatement, SETTLEMENT_SELECT, type SettlementRow } from "@/lib/settlement/statement";
import { renderStatementPdf } from "@/lib/settlement/pdf";
import { attachment } from "@/lib/settlement/download";

// 정산서 PDF. 볼 수 있는 사람은 RLS가 정한다 (지급하는 샵, 받는 강사·팀, 본사).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return new NextResponse("로그인이 필요합니다", { status: 401 });

  const { data } = await supabase.from("settlements").select(SETTLEMENT_SELECT).eq("id", id).maybeSingle();
  if (!data) return new NextResponse("정산서를 찾을 수 없습니다", { status: 404 });

  const s = buildStatement(data as unknown as SettlementRow);
  const pdf = await renderStatementPdf(s);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": attachment(`정산서_${s.month}_${s.payee.name}.pdf`, `statement_${s.month}.pdf`),
      "Cache-Control": "private, no-store",
    },
  });
}
