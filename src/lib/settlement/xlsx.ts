import ExcelJS from "exceljs";
import type { Statement } from "./statement";

// 월 정산 Excel: "정산 요약"(지급 대상별), "강습 내역"(강습별)
export async function renderMonthXlsx(month: string, shopName: string, statements: Statement[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "겨울파트너";
  wb.title = `${shopName} ${month} 정산`;

  const sum = wb.addWorksheet("정산 요약");
  sum.columns = [
    { header: "받는 분", width: 18 },
    { header: "구분", width: 10 },
    { header: "지급 방식", width: 20 },
    { header: "건수", width: 8 },
    { header: "강습료 합계", width: 14 },
    { header: "소득세", width: 12 },
    { header: "지방소득세", width: 12 },
    { header: "원천세 합계", width: 12 },
    { header: "실지급액", width: 14 },
    { header: "상태", width: 12 },
  ];
  for (const s of statements) {
    sum.addRow([s.payee.name, s.payee.kind, s.payType.label, s.items.length, s.gross, s.tax.incomeTax, s.tax.localTax, s.tax.total, s.net, s.status]);
  }
  // 한 줄 띄우고 합계 (화면 요약 카드와 같은 값: 저장된 금액의 합)
  if (statements.length) {
    const t = (f: (s: Statement) => number) => statements.reduce((a, s) => a + f(s), 0);
    sum.addRow([]);
    sum.addRow(["합계", null, null, t((s) => s.items.length), t((s) => s.gross), t((s) => s.tax.incomeTax), t((s) => s.tax.localTax), t((s) => s.tax.total), t((s) => s.net)]).font = { bold: true };
  }
  const items = wb.addWorksheet("강습 내역");
  items.columns = [
    { header: "받는 분", width: 18 },
    { header: "강습 일시", width: 22 },
    { header: "강습", width: 16 },
    { header: "확정 금액", width: 14 },
  ];
  for (const s of statements) for (const i of s.items) items.addRow([s.payee.name, i.when, i.lesson, i.amount]);

  for (const ws of [sum, items]) {
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  for (const c of [5, 6, 7, 8, 9]) sum.getColumn(c).numFmt = "#,##0";
  items.getColumn(4).numFmt = "#,##0";
  return Buffer.from(await wb.xlsx.writeBuffer());
}
